import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runTest() {
  const memberEmail = process.argv[2];
  const memberPassword = process.argv[3];
  const workspaceId = process.argv[4];

  if (!memberEmail || !memberPassword || !workspaceId) {
    console.log("Usage: node verify-settings-rls.mjs <member_email> <password> <workspace_id>");
    console.log("Note: Use a user who has 'member' role in the target workspace, not 'admin'.");
    process.exit(1);
  }

  console.log(`Logging in as ${memberEmail}...`);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: memberEmail,
    password: memberPassword,
  });

  if (authError) {
    console.error("Login failed:", authError.message);
    process.exit(1);
  }

  console.log("Login successful. Attempting to update Workspace Name...");

  // 1. Try to update workspace name
  const { data: wsData, error: wsError } = await supabase
    .from('workspaces')
    .update({ name: 'Hacked Workspace Name' })
    .eq('id', workspaceId)
    .select();

  if (wsError) {
    console.log("✅ SUCCESS: Workspace update blocked by RLS:", wsError.message);
  } else if (wsData && wsData.length === 0) {
    console.log("✅ SUCCESS: Workspace update blocked by RLS (0 rows updated - policy evaluated to false).");
  } else {
    console.error("❌ FAILURE: Workspace was updated! RLS failed or user is an admin.", wsData);
  }

  // 2. Try to change someone's role
  console.log("\nAttempting to elevate own role to admin...");
  const { data: roleData, error: roleError } = await supabase
    .from('workspace_members')
    .update({ role: 'admin' })
    .eq('workspace_id', workspaceId)
    .eq('user_id', authData.user.id)
    .select();

  if (roleError) {
    console.log("✅ SUCCESS: Role update blocked by RLS:", roleError.message);
  } else if (roleData && roleData.length === 0) {
    console.log("✅ SUCCESS: Role update blocked by RLS (0 rows updated).");
  } else {
    console.error("❌ FAILURE: Role was updated! RLS failed.", roleData);
  }
}

runTest();
