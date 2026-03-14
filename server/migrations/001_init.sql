CREATE TABLE IF NOT EXISTS funding_rates (
  venue TEXT    NOT NULL,
  coin  TEXT    NOT NULL,
  time  BIGINT  NOT NULL,
  rate  NUMERIC NOT NULL,
  UNIQUE (venue, coin, time)
);

CREATE INDEX IF NOT EXISTS idx_funding_venue_time
  ON funding_rates (venue, time DESC);
