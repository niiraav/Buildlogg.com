-- Normalise all phone numbers to E.164 format
-- Creates backup tables first for rollback safety

-- Backup existing phones before migration
CREATE TABLE IF NOT EXISTS customers_phone_backup AS
  SELECT id, phone FROM customers WHERE phone IS NOT NULL AND phone != '';

CREATE TABLE IF NOT EXISTS profiles_phone_backup AS
  SELECT id, phone FROM profiles WHERE phone IS NOT NULL AND phone != '';

-- Normalise UK mobile: 07XXXXXXXXX → +447XXXXXXXXX
UPDATE customers SET phone = '+44' || substring(phone from 2)
WHERE phone ~ '^07\d{9}$';

UPDATE profiles SET phone = '+44' || substring(phone from 2)
WHERE phone ~ '^07\d{9}$';

-- Normalise UK with 44 prefix: 447XXXXXXXXX → +447XXXXXXXXX
UPDATE customers SET phone = '+' || phone
WHERE phone ~ '^447\d{9}$';

UPDATE profiles SET phone = '+' || phone
WHERE phone ~ '^447\d{9}$';

-- Normalise 00 international prefix: 00XXXXXXXXXXX → +XXXXXXXXXXX
UPDATE customers SET phone = '+' || substring(phone from 3)
WHERE phone ~ '^00\d{7,15}$';

UPDATE profiles SET phone = '+' || substring(phone from 3)
WHERE phone ~ '^00\d{7,15}$';

-- ROLLBACK (run if something goes wrong):
-- UPDATE customers SET phone = (SELECT phone FROM customers_phone_backup WHERE id = customers.id);
-- UPDATE profiles SET phone = (SELECT phone FROM profiles_phone_backup WHERE id = profiles.id);
-- DROP TABLE customers_phone_backup;
-- DROP TABLE profiles_phone_backup;
