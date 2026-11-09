-- Testing Reports: gears with a different number of engaged clutches. The layout is a new value on its own,
-- so existing templates and tests are untouched. (ADD VALUE gets its own migration, as for the module key.)
ALTER TYPE "TestLayout" ADD VALUE IF NOT EXISTS 'ENGAGED';
