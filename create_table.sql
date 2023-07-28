-- Create a new table called 'propositions' in schema 'break_the_chain'
-- Drop the table if it already exists
DROP TABLE IF EXISTS "break_the_chain"."propositions";

-- Create the table in the specified schema
CREATE TABLE "break_the_chain"."propositions"
(
        channel TEXT NOT NULL,
        game INTEGER NOT NULL,
        string TEXT NOT NULL,
        PRIMARY KEY (channel, game)
);

-- Create a new table called 'facts' in schema 'break_the_chain'
-- Drop the table if it already exists
DROP TABLE IF EXISTS "break_the_chain"."facts";

-- Create the table in the specified schema
CREATE TABLE "break_the_chain"."facts"
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
        FOREIGN KEY (channel, game) REFERENCES "break_the_chain"."propositions" (channel, game)
);

-- Create a new table called 'explanations' in schema 'break_the_chain'
-- Drop the table if it already exists
DROP TABLE IF EXISTS "break_the_chain"."explanations";

-- Create the table in the specified schema
CREATE TABLE "break_the_chain"."explanations"
(
        channel TEXT NOT NULL,
        game INTEGER NOT NULL,
        turn SMALLINT NOT NULL,
        position SMALLINT NOT NULL,
        string TEXT NOT NULL,
        category TEXT NOT NULL,
        PRIMARY KEY (channel, game, turn, position),
        FOREIGN KEY (channel, game, turn, position) REFERENCES "break_the_chain"."facts" (channel, game, turn, position)
);
