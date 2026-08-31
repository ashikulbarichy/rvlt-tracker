-- Add icon column to teams table
RESET ROLE;

ALTER TABLE public.teams 
ADD COLUMN icon text NOT NULL DEFAULT 'Hexagon';
