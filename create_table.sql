-- Create a new table called 'propositions' in schema 'break_the_chain'
-- Drop the table if it already exists
DROP TABLE IF EXISTS "propositions";

-- Create the table in the specified schema
CREATE TABLE "propositions"
(
        channel TEXT NOT NULL,
        game INTEGER NOT NULL,
        string TEXT NOT NULL,
        PRIMARY KEY (channel, game)
);

-- Create a new table called 'facts' in schema 'break_the_chain'
-- Drop the table if it already exists
DROP TABLE IF EXISTS "facts";

-- Create the table in the specified schema
CREATE TABLE "facts"
(
        channel TEXT NOT NULL,
        game INTEGER NOT NULL,
        turn SMALLINT NOT NULL,
        position SMALLINT NOT NULL,
        string TEXT NOT NULL,
        selected BOOLEAN NOT NULL,
        player TEXT NOT NULL,
        won BOOLEAN NOT NULL,
        PRIMARY KEY (channel, game, turn, position),
        FOREIGN KEY (channel, game) REFERENCES "propositions" (channel, game)
);

-- Create a new table called 'explanations' in schema 'break_the_chain'
-- Drop the table if it already exists
DROP TABLE IF EXISTS "explanations";

-- Create the table in the specified schema
CREATE TABLE "explanations"
(
        channel TEXT NOT NULL,
        game INTEGER NOT NULL,
        turn SMALLINT NOT NULL,
        position SMALLINT NOT NULL,
        string TEXT NOT NULL,
        category TEXT NOT NULL,
        PRIMARY KEY (channel, game, turn, position),
        FOREIGN KEY (channel, game, turn, position) REFERENCES "facts" (channel, game, turn, position)
);
