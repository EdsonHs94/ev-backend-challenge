-- Up Migration
CREATE TABLE test_clock (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    now timestamptz NOT NULL
);

-- Down Migration
DROP TABLE test_clock;
