-- ============================================================================
-- Domain-Agnostic Threaded Comments Schema Recipe for PostgreSQL 16+
--
-- Module: vue-threaded-comments (packages/comments)
--
-- Features:
--   - Hierarchical threaded comments powered by PostgreSQL ltree.
--   - Polymorphic targets (target_id text + target_type text).
--   - Built-in upvoting/downvoting with automatic aggregate counters.
--   - User ban management.
--   - Strict server-side security:
--       * Guest/anonymous sessions forced to 'pending_review' status.
--       * Vote counters and pinned status always reset on insert.
--       * Update permissions restricted via an allowlist trigger.
--       * Parent comments strictly validated to belong to the same target thread.
--       * Sensitive column (guest_email) protected via column-level REVOKE.
--       * RPCs for soft-deleting (owner) and admin moderation (staff).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PostgreSQL Version & Extension Checks
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Raw UUID labels with hyphens in ltree require PostgreSQL 16 or newer.
    IF current_setting('server_version_num')::integer < 160000 THEN
        RAISE EXCEPTION 'vue-threaded-comments requires PostgreSQL 16 or newer (detected %)',
            current_setting('server_version');
    END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS ltree WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 2. Staff Authorization Helper
-- ----------------------------------------------------------------------------
-- Host applications should customize this helper to match their auth roles
-- (e.g. app_metadata.role, custom user_roles table, or profiles table).
CREATE OR REPLACE FUNCTION public.is_comment_staff()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
    RETURN (
        coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'moderator', 'staff')
        OR coalesce(auth.jwt() ->> 'role', '') IN ('admin', 'moderator', 'staff')
        OR coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') IN ('admin', 'moderator', 'staff')
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Core Tables
-- ----------------------------------------------------------------------------

-- A. comments: stores threaded comments for any target entity
CREATE TABLE IF NOT EXISTS public.comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id text NOT NULL,
    target_type text NOT NULL,
    parent_comment_id uuid REFERENCES public.comments(id) ON DELETE SET NULL,
    path extensions.ltree,
    user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    guest_name text,
    guest_email text,
    content text NOT NULL,
    image_upload_url text,
    file_upload_url text,
    upvote_count integer DEFAULT 0 NOT NULL,
    downvote_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'published' NOT NULL
        CHECK (status IN ('published', 'pending_review', 'hidden')),
    is_pinned boolean DEFAULT false NOT NULL,
    moderation_reason text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

    -- Authorship constraint: comment must have an authenticated user_id OR both guest_name & guest_email.
    -- Preserved comments whose authors were deleted via ON DELETE SET NULL are permitted.
    CONSTRAINT comments_author_check CHECK (
        (user_id IS NOT NULL)
        OR ((guest_name IS NOT NULL) AND (guest_email IS NOT NULL))
        OR (user_id IS NULL AND guest_name IS NULL AND guest_email IS NULL)
    ),
    -- Content length constraint (adjust upper bound as needed by host application)
    CONSTRAINT comments_content_length_check CHECK (
        char_length(content) > 0 AND char_length(content) <= 2000
    )
);

-- B. comment_votes: tracks upvotes and downvotes per user
CREATE TABLE IF NOT EXISTS public.comment_votes (
    comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
    user_id uuid DEFAULT auth.uid() NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vote_type text NOT NULL CHECK (vote_type IN ('up', 'down')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (comment_id, user_id)
);

-- C. comment_bans: records users banned from posting comments
CREATE TABLE IF NOT EXISTS public.comment_bans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    banned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    reason text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ----------------------------------------------------------------------------
-- 4. Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_comments_target ON public.comments (target_id, target_type);
CREATE INDEX IF NOT EXISTS idx_comments_path_gist ON public.comments USING gist (path);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.comments (parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON public.comments (user_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON public.comments (status);
CREATE INDEX IF NOT EXISTS idx_comment_votes_user ON public.comment_votes (user_id);
CREATE INDEX IF NOT EXISTS idx_comment_bans_user ON public.comment_bans (user_id);

-- ----------------------------------------------------------------------------
-- 5. Functions & Triggers
-- ----------------------------------------------------------------------------

-- A. Trigger: Build hierarchical ltree path from raw UUIDs
-- Contract: each path label is the raw UUID of the comment, which the frontend
-- tree builder relies upon to reconstruct thread hierarchy and tombstone placeholders.
CREATE OR REPLACE FUNCTION public.set_comment_path()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
    parent_path extensions.ltree;
BEGIN
    IF NEW.parent_comment_id IS NULL THEN
        NEW.path := extensions.ltree(NEW.id::text);
    ELSE
        SELECT path INTO parent_path FROM public.comments WHERE id = NEW.parent_comment_id;
        IF parent_path IS NULL THEN
            RAISE EXCEPTION 'Parent comment % not found', NEW.parent_comment_id
                USING ERRCODE = '23503';
        END IF;
        NEW.path := parent_path || extensions.ltree(NEW.id::text);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_comment_path ON public.comments;
CREATE TRIGGER trigger_set_comment_path
BEFORE INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.set_comment_path();

-- B. Trigger: Validate that parent comment belongs to the same target entity
CREATE OR REPLACE FUNCTION public.validate_comment_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_parent_target_id text;
    v_parent_target_type text;
BEGIN
    IF NEW.parent_comment_id IS NOT NULL THEN
        SELECT target_id, target_type INTO v_parent_target_id, v_parent_target_type
        FROM public.comments
        WHERE id = NEW.parent_comment_id;

        IF v_parent_target_id IS DISTINCT FROM NEW.target_id
           OR v_parent_target_type IS DISTINCT FROM NEW.target_type THEN
            RAISE EXCEPTION 'Parent comment % belongs to a different target (%, %) than child (%, %)',
                NEW.parent_comment_id, v_parent_target_id, v_parent_target_type, NEW.target_id, NEW.target_type
                USING ERRCODE = '22023';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validate_comment_parent ON public.comments;
CREATE TRIGGER trigger_validate_comment_parent
BEFORE INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.validate_comment_parent();

-- C. Trigger: Set server-enforced defaults on INSERT
-- Guarantees client cannot spoof votes, pinned status, or bypass guest moderation.
CREATE OR REPLACE FUNCTION public.set_comment_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_is_anon boolean := COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false);
    v_is_staff boolean := public.is_comment_staff();
BEGIN
    -- Seeded vote counters and pin flags are always reset to default
    NEW.upvote_count := 0;
    NEW.downvote_count := 0;
    NEW.is_pinned := false;
    NEW.created_at := timezone('utc'::text, now());
    NEW.updated_at := timezone('utc'::text, now());

    -- Determine status based on identity
    IF v_is_anon THEN
        -- Anonymous guest sessions always land in moderation
        NEW.status := 'pending_review';
    ELSIF v_is_staff THEN
        NEW.status := COALESCE(NEW.status, 'published');
    ELSE
        NEW.status := 'published';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_comment_insert_defaults ON public.comments;
CREATE TRIGGER trigger_set_comment_insert_defaults
BEFORE INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.set_comment_insert_defaults();

-- D. Trigger: Allowlist for UPDATE operations
-- Non-staff owners may only edit content or soft-delete (status -> 'hidden').
CREATE OR REPLACE FUNCTION public.protect_comment_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
    v_is_staff boolean := public.is_comment_staff();
    v_is_owner boolean := (OLD.user_id IS NOT NULL AND OLD.user_id = auth.uid());
    v_is_anon boolean;
BEGIN
    -- Allow internal trigger cascades (e.g. update_comment_vote_counts tally)
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    -- Staff can update any column (moderation, pinning, status changes)
    IF v_is_staff THEN
        NEW.updated_at := timezone('utc'::text, now());
        RETURN NEW;
    END IF;

    -- Non-staff must be the comment owner
    IF NOT v_is_owner THEN
        RAISE EXCEPTION 'You do not have permission to modify this comment.'
            USING ERRCODE = '42501';
    END IF;

    -- Strict allowlist: non-staff owners cannot alter immutable columns
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.path IS DISTINCT FROM OLD.path
       OR NEW.guest_name IS DISTINCT FROM OLD.guest_name
       OR NEW.guest_email IS DISTINCT FROM OLD.guest_email
       OR NEW.image_upload_url IS DISTINCT FROM OLD.image_upload_url
       OR NEW.file_upload_url IS DISTINCT FROM OLD.file_upload_url
       OR NEW.upvote_count IS DISTINCT FROM OLD.upvote_count
       OR NEW.downvote_count IS DISTINCT FROM OLD.downvote_count
       OR NEW.target_id IS DISTINCT FROM OLD.target_id
       OR NEW.target_type IS DISTINCT FROM OLD.target_type
       OR NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id
       OR NEW.is_pinned IS DISTINCT FROM OLD.is_pinned
       OR NEW.moderation_reason IS DISTINCT FROM OLD.moderation_reason
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Only content or deletion status may be modified by the author.'
            USING ERRCODE = '42501';
    END IF;

    -- Status change validation: non-staff owner may only set status to 'hidden'
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status <> 'hidden' THEN
            RAISE EXCEPTION 'Unauthorized status change.' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Content modification validation
    IF NEW.content IS DISTINCT FROM OLD.content THEN
        IF OLD.status = 'hidden' THEN
            RAISE EXCEPTION 'Cannot edit a deleted comment.' USING ERRCODE = '42501';
        END IF;

        v_is_anon := COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false);
        IF v_is_anon THEN
            -- Anonymous edits must be re-moderated
            NEW.status := 'pending_review';
        ELSE
            -- Registered user edits must keep published status
            IF OLD.status = 'published' THEN
                NEW.status := 'published';
            ELSE
                RAISE EXCEPTION 'Cannot edit a comment that is not published.' USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_protect_comment_columns ON public.comments;
CREATE TRIGGER trigger_protect_comment_columns
BEFORE UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.protect_comment_columns();

-- E. Trigger: Update vote counts on comments when comment_votes changes (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.update_comment_vote_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF NEW.vote_type = 'up' THEN
            UPDATE public.comments SET upvote_count = upvote_count + 1 WHERE id = NEW.comment_id;
        ELSE
            UPDATE public.comments SET downvote_count = downvote_count + 1 WHERE id = NEW.comment_id;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF OLD.vote_type = 'up' AND NEW.vote_type = 'down' THEN
            UPDATE public.comments
            SET upvote_count = upvote_count - 1, downvote_count = downvote_count + 1
            WHERE id = NEW.comment_id;
        ELSIF OLD.vote_type = 'down' AND NEW.vote_type = 'up' THEN
            UPDATE public.comments
            SET downvote_count = downvote_count - 1, upvote_count = upvote_count + 1
            WHERE id = NEW.comment_id;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        IF OLD.vote_type = 'up' THEN
            UPDATE public.comments SET upvote_count = upvote_count - 1 WHERE id = OLD.comment_id;
        ELSE
            UPDATE public.comments SET downvote_count = downvote_count - 1 WHERE id = OLD.comment_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

ALTER FUNCTION public.update_comment_vote_counts() OWNER TO postgres;

DROP TRIGGER IF EXISTS trigger_update_comment_vote_counts ON public.comment_votes;
CREATE TRIGGER trigger_update_comment_vote_counts
AFTER INSERT OR UPDATE OR DELETE ON public.comment_votes
FOR EACH ROW EXECUTE FUNCTION public.update_comment_vote_counts();

-- ----------------------------------------------------------------------------
-- 6. Remote Procedure Calls (RPCs)
-- ----------------------------------------------------------------------------

-- A. Soft-delete comment as owner (SECURITY DEFINER)
-- Direct UPDATE comments SET status = 'hidden' by non-staff fails RLS because
-- hidden rows are not visible to non-staff SELECT policies. This RPC handles it safely.
CREATE OR REPLACE FUNCTION public.soft_delete_comment(p_comment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_updated integer;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.comments
    SET status = 'hidden',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_comment_id
      AND status <> 'hidden'
      AND user_id = v_user_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
        RAISE EXCEPTION 'Comment not found or unauthorized.' USING ERRCODE = '42501';
    END IF;
END;
$$;

ALTER FUNCTION public.soft_delete_comment(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.soft_delete_comment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_comment(uuid) TO authenticated, service_role;

-- B. Dedicated RPC for staff to fetch comments including guest_email (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_admin_comments(
    p_status text DEFAULT 'all',
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT public.is_comment_staff() THEN
        RAISE EXCEPTION 'Unauthorized staff access.' USING ERRCODE = '42501';
    END IF;

    SELECT coalesce(
        jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC),
        '[]'::jsonb
    )
    INTO v_result
    FROM (
        SELECT *
        FROM public.comments
        WHERE (p_status = 'all' OR status = p_status)
        ORDER BY created_at DESC
        LIMIT p_limit
        OFFSET p_offset
    ) c;

    RETURN v_result;
END;
$$;

ALTER FUNCTION public.get_admin_comments(text, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_admin_comments(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_comments(text, integer, integer) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. Row Level Security (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_bans ENABLE ROW LEVEL SECURITY;

-- Comments RLS Policies
DROP POLICY IF EXISTS "comments_select_policy" ON public.comments;
CREATE POLICY "comments_select_policy" ON public.comments
FOR SELECT TO anon, authenticated
USING (
    status = 'published'
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid() AND status <> 'hidden')
    OR public.is_comment_staff()
);

DROP POLICY IF EXISTS "comments_insert_policy" ON public.comments;
CREATE POLICY "comments_insert_policy" ON public.comments
FOR INSERT TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
        SELECT 1 FROM public.comment_bans
        WHERE comment_bans.user_id = auth.uid()
          AND (expires_at IS NULL OR expires_at > now())
    )
);

DROP POLICY IF EXISTS "comments_update_policy" ON public.comments;
CREATE POLICY "comments_update_policy" ON public.comments
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_comment_staff())
WITH CHECK (user_id = auth.uid() OR public.is_comment_staff());

DROP POLICY IF EXISTS "comments_delete_policy" ON public.comments;
CREATE POLICY "comments_delete_policy" ON public.comments
FOR DELETE TO authenticated
USING (public.is_comment_staff());

-- Comment Votes RLS Policies
DROP POLICY IF EXISTS "comment_votes_select_policy" ON public.comment_votes;
CREATE POLICY "comment_votes_select_policy" ON public.comment_votes
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "comment_votes_insert_policy" ON public.comment_votes;
CREATE POLICY "comment_votes_insert_policy" ON public.comment_votes
FOR INSERT TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
        SELECT 1 FROM public.comment_bans
        WHERE comment_bans.user_id = auth.uid()
          AND (expires_at IS NULL OR expires_at > now())
    )
);

DROP POLICY IF EXISTS "comment_votes_update_policy" ON public.comment_votes;
CREATE POLICY "comment_votes_update_policy" ON public.comment_votes
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "comment_votes_delete_policy" ON public.comment_votes;
CREATE POLICY "comment_votes_delete_policy" ON public.comment_votes
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Comment Bans RLS Policies
DROP POLICY IF EXISTS "comment_bans_select_policy" ON public.comment_bans;
CREATE POLICY "comment_bans_select_policy" ON public.comment_bans
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_comment_staff());

DROP POLICY IF EXISTS "comment_bans_staff_manage_policy" ON public.comment_bans;
CREATE POLICY "comment_bans_staff_manage_policy" ON public.comment_bans
FOR ALL TO authenticated
USING (public.is_comment_staff())
WITH CHECK (public.is_comment_staff());

-- ----------------------------------------------------------------------------
-- 8. Column-Level Privileges (guest_email Protection)
-- ----------------------------------------------------------------------------
-- RLS filters rows, not columns. To prevent guest_email exposure to public
-- roles, table-level SELECT is revoked and column-level SELECT is explicitly granted.
REVOKE SELECT ON public.comments FROM anon, authenticated;

GRANT SELECT (
    id,
    target_id,
    target_type,
    parent_comment_id,
    path,
    user_id,
    guest_name,
    content,
    image_upload_url,
    file_upload_url,
    upvote_count,
    downvote_count,
    status,
    is_pinned,
    moderation_reason,
    created_at,
    updated_at
) ON public.comments TO anon, authenticated;

-- Service role retains full access for administrative operations
GRANT ALL ON public.comments TO service_role;
GRANT ALL ON public.comment_votes TO service_role;
GRANT ALL ON public.comment_bans TO service_role;

-- ----------------------------------------------------------------------------
-- 9. Optional: Cascade Clean-up Trigger on Target Deletion
-- ----------------------------------------------------------------------------
-- Since target_id is polymorphic (no foreign key), host applications can
-- attach clean-up triggers to their target tables (e.g. articles, songs):
--
-- Example:
-- CREATE OR REPLACE FUNCTION cleanup_target_comments()
-- RETURNS trigger AS $$
-- BEGIN
--     DELETE FROM public.comments
--     WHERE target_id = OLD.id::text AND target_type = 'article';
--     RETURN OLD;
-- END;
-- $$ LANGUAGE plpgsql;
--
-- CREATE TRIGGER trigger_cleanup_article_comments
-- AFTER DELETE ON public.articles
-- FOR EACH ROW EXECUTE FUNCTION cleanup_target_comments();
