-- =============================================================================
-- DCSC Board Portal — Initial Database Schema
-- Supabase PostgreSQL Migration
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------------------

CREATE TYPE public.board_role AS ENUM (
  'chair',
  'vice_chair',
  'secretary',
  'treasurer',
  'board_member',
  'staff',
  'guest'
);

CREATE TYPE public.committee_role AS ENUM (
  'chair',
  'member'
);

CREATE TYPE public.meeting_status AS ENUM (
  'scheduled',
  'in_progress',
  'completed',
  'cancelled'
);

CREATE TYPE public.agenda_item_status AS ENUM (
  'pending',
  'discussed',
  'tabled',
  'approved'
);

CREATE TYPE public.action_item_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'overdue'
);

CREATE TYPE public.action_item_priority AS ENUM (
  'low',
  'medium',
  'high'
);

CREATE TYPE public.announcement_audience AS ENUM (
  'all_board',
  'committee',
  'executives'
);

CREATE TYPE public.audit_action AS ENUM (
  'view',
  'create',
  'update',
  'delete',
  'download',
  'login'
);

-- ---------------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------------

-- profiles ----------------------------------------------------------------
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email       text UNIQUE NOT NULL,
  full_name   text NOT NULL,
  role        public.board_role NOT NULL DEFAULT 'board_member',
  phone       text,
  avatar_url  text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'Board member profiles, 1:1 with auth.users';

-- committees --------------------------------------------------------------
CREATE TABLE public.committees (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text UNIQUE NOT NULL,
  description     text,
  drive_folder_id text,
  chair_id        uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.committees IS 'Board committees; drive_folder_id links to Google Drive';

-- committee_memberships ---------------------------------------------------
CREATE TABLE public.committee_memberships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  committee_id uuid NOT NULL REFERENCES public.committees (id) ON DELETE CASCADE,
  role         public.committee_role NOT NULL DEFAULT 'member',
  joined_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_committee_membership UNIQUE (profile_id, committee_id)
);

COMMENT ON TABLE public.committee_memberships IS 'Many-to-many between profiles and committees';

-- meetings ----------------------------------------------------------------
CREATE TABLE public.meetings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id   uuid REFERENCES public.committees (id) ON DELETE SET NULL,
  title          text NOT NULL,
  description    text,
  meeting_date   timestamptz NOT NULL,
  location       text,
  gcal_event_id  text,
  status         public.meeting_status NOT NULL DEFAULT 'scheduled',
  created_by     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meetings IS 'Meeting records; NULL committee_id = full board meeting';

-- agenda_items ------------------------------------------------------------
CREATE TABLE public.agenda_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id       uuid NOT NULL REFERENCES public.meetings (id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text,
  presenter_id     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  order_position   integer NOT NULL DEFAULT 0,
  duration_minutes integer,
  status           public.agenda_item_status NOT NULL DEFAULT 'pending',
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agenda_items IS 'Ordered agenda items within a meeting';

-- action_items ------------------------------------------------------------
CREATE TABLE public.action_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id     uuid REFERENCES public.meetings (id) ON DELETE SET NULL,
  agenda_item_id uuid REFERENCES public.agenda_items (id) ON DELETE SET NULL,
  title          text NOT NULL,
  description    text,
  assignee_id    uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  due_date       date,
  status         public.action_item_status NOT NULL DEFAULT 'pending',
  priority       public.action_item_priority NOT NULL DEFAULT 'medium',
  created_by     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);

COMMENT ON TABLE public.action_items IS 'Tasks arising from meetings or standalone';

-- announcements -----------------------------------------------------------
CREATE TABLE public.announcements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  body                text NOT NULL,
  author_id           uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  target_audience     public.announcement_audience NOT NULL DEFAULT 'all_board',
  target_committee_id uuid REFERENCES public.committees (id) ON DELETE SET NULL,
  is_pinned           boolean NOT NULL DEFAULT false,
  published_at        timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.announcements IS 'Board-wide or committee-scoped announcements';

-- document_references -----------------------------------------------------
CREATE TABLE public.document_references (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id   text NOT NULL,
  drive_folder_id text,
  filename        text NOT NULL,
  mime_type       text,
  committee_id    uuid REFERENCES public.committees (id) ON DELETE SET NULL,
  meeting_id      uuid REFERENCES public.meetings (id) ON DELETE SET NULL,
  uploaded_by     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE SET NULL,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.document_references IS 'Metadata pointers to Google Drive files; no blob storage';

-- audit_log ---------------------------------------------------------------
CREATE TABLE public.audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action        public.audit_action NOT NULL,
  resource_type text NOT NULL,
  resource_id   uuid,
  metadata      jsonb DEFAULT '{}'::jsonb,
  ip_address    inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_log IS 'Append-only audit trail; officers read, all authenticated insert';

-- ---------------------------------------------------------------------------
-- 3. INDEXES
-- ---------------------------------------------------------------------------

CREATE INDEX idx_meetings_committee_date
  ON public.meetings (committee_id, meeting_date DESC);

CREATE INDEX idx_action_items_assignee_status
  ON public.action_items (assignee_id, status);

CREATE INDEX idx_action_items_due_date
  ON public.action_items (due_date)
  WHERE status IN ('pending', 'in_progress');

CREATE INDEX idx_audit_log_profile_created
  ON public.audit_log (profile_id, created_at DESC);

CREATE INDEX idx_audit_log_resource
  ON public.audit_log (resource_type, resource_id);

CREATE INDEX idx_agenda_items_meeting
  ON public.agenda_items (meeting_id, order_position);

CREATE INDEX idx_announcements_published
  ON public.announcements (published_at DESC);

CREATE INDEX idx_document_references_committee
  ON public.document_references (committee_id);

CREATE INDEX idx_document_references_meeting
  ON public.document_references (meeting_id);

-- ---------------------------------------------------------------------------
-- 4. UPDATED_AT TRIGGER
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. AUTO-CREATE PROFILE ON SIGNUP
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(COALESCE(NEW.email, ''), '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data ->> 'avatar_url',
      NEW.raw_user_meta_data ->> 'picture'
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 6. RLS HELPER FUNCTIONS
-- ---------------------------------------------------------------------------

-- Officers = Chair, Vice Chair, Secretary, Treasurer
CREATE OR REPLACE FUNCTION public.is_officer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('chair', 'vice_chair', 'secretary', 'treasurer')
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_committee_member(p_committee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.committee_memberships
    WHERE profile_id = auth.uid()
      AND committee_id = p_committee_id
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. ENABLE RLS ON ALL TABLES
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committees            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_references   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log             ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 8. RLS POLICIES
-- ---------------------------------------------------------------------------

-- profiles ----------------------------------------------------------------

CREATE POLICY "Authenticated users can read active profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- committees --------------------------------------------------------------

CREATE POLICY "Authenticated users can read committees"
  ON public.committees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Officers can insert committees"
  ON public.committees FOR INSERT
  TO authenticated
  WITH CHECK (public.is_officer());

CREATE POLICY "Officers can update committees"
  ON public.committees FOR UPDATE
  TO authenticated
  USING (public.is_officer())
  WITH CHECK (public.is_officer());

-- committee_memberships ---------------------------------------------------

CREATE POLICY "Authenticated users can read memberships"
  ON public.committee_memberships FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Officers can insert memberships"
  ON public.committee_memberships FOR INSERT
  TO authenticated
  WITH CHECK (public.is_officer());

CREATE POLICY "Officers can update memberships"
  ON public.committee_memberships FOR UPDATE
  TO authenticated
  USING (public.is_officer())
  WITH CHECK (public.is_officer());

CREATE POLICY "Officers can delete memberships"
  ON public.committee_memberships FOR DELETE
  TO authenticated
  USING (public.is_officer());

-- meetings ----------------------------------------------------------------

CREATE POLICY "Members can see relevant meetings"
  ON public.meetings FOR SELECT
  TO authenticated
  USING (
    committee_id IS NULL
    OR public.is_committee_member(committee_id)
    OR public.is_officer()
  );

CREATE POLICY "Authenticated users can create meetings"
  ON public.meetings FOR INSERT
  TO authenticated
  WITH CHECK (
    (committee_id IS NULL AND public.is_officer())
    OR (committee_id IS NOT NULL AND public.is_committee_member(committee_id))
  );

CREATE POLICY "Meeting creators and officers can update"
  ON public.meetings FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_officer())
  WITH CHECK (created_by = auth.uid() OR public.is_officer());

-- agenda_items ------------------------------------------------------------

CREATE POLICY "Agenda items inherit meeting visibility"
  ON public.agenda_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND (
          m.committee_id IS NULL
          OR public.is_committee_member(m.committee_id)
          OR public.is_officer()
        )
    )
  );

CREATE POLICY "Committee members can insert agenda items"
  ON public.agenda_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id
        AND (
          (m.committee_id IS NULL AND public.is_officer())
          OR (m.committee_id IS NOT NULL AND public.is_committee_member(m.committee_id))
        )
    )
  );

CREATE POLICY "Officers and meeting creators can update agenda items"
  ON public.agenda_items FOR UPDATE
  TO authenticated
  USING (
    public.is_officer()
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_id AND m.created_by = auth.uid()
    )
  );

-- action_items ------------------------------------------------------------

CREATE POLICY "Assignees and committee members can see action items"
  ON public.action_items FOR SELECT
  TO authenticated
  USING (
    assignee_id = auth.uid()
    OR created_by = auth.uid()
    OR public.is_officer()
    OR (
      meeting_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.meetings m
        WHERE m.id = meeting_id
          AND (
            m.committee_id IS NULL
            OR public.is_committee_member(m.committee_id)
          )
      )
    )
  );

CREATE POLICY "Authenticated users can create action items"
  ON public.action_items FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Assignees can update their action items"
  ON public.action_items FOR UPDATE
  TO authenticated
  USING (
    assignee_id = auth.uid()
    OR created_by = auth.uid()
    OR public.is_officer()
  )
  WITH CHECK (
    assignee_id = auth.uid()
    OR created_by = auth.uid()
    OR public.is_officer()
  );

-- announcements -----------------------------------------------------------

CREATE POLICY "Users see announcements matching their audience"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    target_audience = 'all_board'
    OR (
      target_audience = 'committee'
      AND target_committee_id IS NOT NULL
      AND public.is_committee_member(target_committee_id)
    )
    OR (target_audience = 'executives' AND public.is_officer())
    OR author_id = auth.uid()
  );

CREATE POLICY "Officers and committee chairs can create announcements"
  ON public.announcements FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.is_officer()
      OR EXISTS (
        SELECT 1 FROM public.committee_memberships
        WHERE profile_id = auth.uid() AND role = 'chair'
      )
    )
  );

CREATE POLICY "Authors and officers can update announcements"
  ON public.announcements FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid() OR public.is_officer())
  WITH CHECK (author_id = auth.uid() OR public.is_officer());

-- document_references -----------------------------------------------------

CREATE POLICY "Document refs filtered by committee membership"
  ON public.document_references FOR SELECT
  TO authenticated
  USING (
    committee_id IS NULL
    OR public.is_committee_member(committee_id)
    OR public.is_officer()
  );

CREATE POLICY "Authenticated users can insert document refs"
  ON public.document_references FOR INSERT
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Uploaders and officers can update document refs"
  ON public.document_references FOR UPDATE
  TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_officer())
  WITH CHECK (uploaded_by = auth.uid() OR public.is_officer());

-- audit_log ---------------------------------------------------------------

CREATE POLICY "Only officers can read audit log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.is_officer());

CREATE POLICY "All authenticated users can insert audit entries"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- No UPDATE or DELETE policies: audit_log is append-only

-- ---------------------------------------------------------------------------
-- 9. SEED DATA — DEFAULT COMMITTEES
-- ---------------------------------------------------------------------------

INSERT INTO public.committees (name, description) VALUES
  ('Audit',                      'Oversees financial reporting, internal controls, and compliance'),
  ('Risk',                       'Identifies, assesses, and monitors organizational risks'),
  ('Nominating and Governance',  'Manages board nominations, governance policies, and board evaluation'),
  ('Strategic Planning',         'Guides long-term strategic direction and organizational planning'),
  ('Compensation',               'Oversees executive compensation, benefits, and performance review');
