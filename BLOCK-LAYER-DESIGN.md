Block Layer Design
==================

First Pass
----------

1 - Blocks are 4k
2 - Every write is to a free block
3 - Blocks exist in a fixed size Segment (not sure how big)
4 - First two blocks in a Segment are the Segment Map blocks.
    alternatively: FIRST and LAST block are Segment Map Blocks
5 - Segment Map blocks are redundent and store a CRC-16
6 - First two blocks in the file are Datastore meta-data & redundent & CRC-16'd

h3. Datastore Metadata block

    byte# | datatype | description
    ------+----------+---------
    0-1   | u16      | CRC-16
    1-2   | u16      | Number of segments

h3. Segment Map block

    byte#  | datatype | description
    -------+----------+-------------
    0-1    | u16      | CRC-16
    2-4095 | bitmap   | block allocation bitmap

4094 bytes => 32752 bits
32752 blocks => 131008 KB => ~128 MB

h3. Block HandleId

    bit#   | #bits | num   |description
    -------+---------------+-------------
     0-12  |  13   |  8192 | segment number
    13-27  |  15   | 32768 | block number
    28-31  |   4   |    16 | number additional of blocks
