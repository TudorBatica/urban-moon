# Split the draw engine

## Description

The draw engine under input-capture-web has become an insane JS piece of shit thousands LoC long monster.
Split it into multiple TS components. 
Order:
1. do a subdirectory under floorplan exclusively for the engine files.s
2. read the existing .js engine and design components to be split into
3. write unit tests for those components to validate the exact same behaviour is kept
4. implement the components to pass the unit tests
