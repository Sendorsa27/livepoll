-- ==========================================
-- SST HOUSE VOTING SYSTEM - DATABASE SETUP (HARDENED)
-- ==========================================

-- 1. Enable CITEXT extension for case-insensitive text matching
CREATE EXTENSION IF NOT EXISTS citext;

-- Drop existing tables to ensure clean rebuild
DROP TABLE IF EXISTS admin_logs CASCADE;
DROP TABLE IF EXISTS votes CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS house_votes CASCADE;

-- 2. Create Students Table (email is CITEXT primary key)
CREATE TABLE students (
  email CITEXT PRIMARY KEY,
  house TEXT NOT NULL CHECK (house IN ('Phoenix', 'Leo', 'Kong', 'Tuskers'))
);

-- 3. Create Votes Table (student_email is UNIQUE CITEXT referencing students.email)
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_email CITEXT REFERENCES students(email) UNIQUE NOT NULL,
  voted_house TEXT NOT NULL CHECK (voted_house IN ('Phoenix', 'Leo', 'Kong', 'Tuskers')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Create Settings Table (tracks lock and results visibility)
CREATE TABLE settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  voting_locked BOOLEAN DEFAULT FALSE NOT NULL,
  results_visible BOOLEAN DEFAULT FALSE NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Initialize settings
INSERT INTO settings (id, voting_locked, results_visible)
VALUES (1, FALSE, FALSE)
ON CONFLICT (id) DO NOTHING;

-- 5. Create House Votes Aggregated Table (publicly readable for realtime screen)
CREATE TABLE house_votes (
  house TEXT PRIMARY KEY CHECK (house IN ('Phoenix', 'Leo', 'Kong', 'Tuskers')),
  count INTEGER DEFAULT 0 NOT NULL
);

-- Initialize houses
INSERT INTO house_votes (house, count) VALUES
  ('Phoenix', 0),
  ('Leo', 0),
  ('Kong', 0),
  ('Tuskers', 0)
ON CONFLICT (house) DO NOTHING;

-- 6. Create Admin Audit Logs Table
CREATE TABLE admin_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_email CITEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 7. Trigger to automatically increment house votes count on vote insertion
CREATE OR REPLACE FUNCTION increment_house_vote()
RETURNS TRIGGER AS $$
BEGIN
  -- We normalize the house name before matching
  UPDATE house_votes
  SET count = count + 1
  WHERE LOWER(house) = LOWER(NEW.voted_house);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER after_vote_insert
AFTER INSERT ON votes
FOR EACH ROW
EXECUTE FUNCTION increment_house_vote();

-- 8. Trigger to validate vote before insertion (Double Tap, Self-Vote, Locking Check, Domain Check)
CREATE OR REPLACE FUNCTION validate_vote()
RETURNS TRIGGER AS $$
DECLARE
  student_house TEXT;
  is_locked BOOLEAN;
BEGIN
  -- Check if voting is locked
  SELECT voting_locked INTO is_locked FROM settings WHERE id = 1;
  IF is_locked THEN
    RAISE EXCEPTION 'Voting has ended.';
  END IF;

  -- Verify SST domain on the database level (case-insensitive check)
  IF NOT LOWER(NEW.student_email) LIKE '%@sst.scaler.com' THEN
    RAISE EXCEPTION 'Invalid student email domain.';
  END IF;

  -- Fetch student house (case-insensitive lookup)
  SELECT house INTO student_house FROM students WHERE LOWER(email) = LOWER(NEW.student_email);
  
  -- Check student eligibility
  IF student_house IS NULL THEN
    RAISE EXCEPTION 'You are not eligible to vote.';
  END IF;

  -- Check self-house voting (case-insensitive comparison)
  IF LOWER(student_house) = LOWER(NEW.voted_house) THEN
    RAISE EXCEPTION 'A student cannot vote for their own house.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER before_vote_insert
BEFORE INSERT ON votes
FOR EACH ROW
EXECUTE FUNCTION validate_vote();

-- 9. Enable replication for realtime tables
ALTER publication supabase_realtime ADD TABLE settings;
ALTER publication supabase_realtime ADD TABLE house_votes;

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE house_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

-- Select policies (read-only where public access is needed)
CREATE POLICY "Allow public select students" ON students FOR SELECT USING (true);
CREATE POLICY "Allow public select settings" ON settings FOR SELECT USING (true);
CREATE POLICY "Allow public select house_votes" ON house_votes FOR SELECT USING (true);

-- Allow authenticated users to insert their own vote (with case-insensitive email comparison)
CREATE POLICY "Allow authenticated insert votes" ON votes FOR INSERT TO authenticated 
WITH CHECK (LOWER(student_email) = LOWER(auth.jwt()->>'email'));

-- Allow authenticated users to select their own vote (with case-insensitive email comparison)
CREATE POLICY "Allow authenticated select votes" ON votes FOR SELECT TO authenticated
USING (LOWER(student_email) = LOWER(auth.jwt()->>'email'));

-- Admin logs and select votes: disabled for normal clients. Admins bypass via Service Role.

-- ==========================================
-- SEED DATA (FOR TESTING CASE-INSENSITIVITY)
-- ==========================================
INSERT INTO students (email, house) VALUES
  ('alice@sst.scaler.com', 'Phoenix'),
  ('bob@sst.scaler.com', 'Leo'),
  ('charlie@sst.scaler.com', 'Kong'),
  ('diana@sst.scaler.com', 'Tuskers'),
  ('ethan@sst.scaler.com', 'Phoenix')
ON CONFLICT (email) DO NOTHING;
