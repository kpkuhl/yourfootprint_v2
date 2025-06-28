-- Add unique constraint to prevent multiple households per user
-- This ensures that each user can only have one household

-- First, let's see if there are any duplicate user_ids
SELECT user_id, COUNT(*) as household_count
FROM households
GROUP BY user_id
HAVING COUNT(*) > 1;

-- If there are duplicates, you'll need to clean them up first
-- For now, let's add the unique constraint
-- If there are duplicates, this will fail and you'll need to clean them up first

ALTER TABLE households 
ADD CONSTRAINT households_user_id_unique UNIQUE (user_id);

-- Verify the constraint was added
SELECT 
    constraint_name,
    constraint_type,
    table_name
FROM information_schema.table_constraints 
WHERE table_name = 'households' 
AND constraint_type = 'UNIQUE'; 