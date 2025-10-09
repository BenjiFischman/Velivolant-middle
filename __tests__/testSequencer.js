const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // Sort tests to run database.test.js last
    // This ensures all unit tests run first, then integration tests
    const copyTests = Array.from(tests);
    return copyTests.sort((testA, testB) => {
      const aIsDatabase = testA.path.includes('database.test.js');
      const bIsDatabase = testB.path.includes('database.test.js');
      
      if (aIsDatabase && !bIsDatabase) return 1;
      if (!aIsDatabase && bIsDatabase) return -1;
      return testA.path > testB.path ? 1 : -1;
    });
  }
}

module.exports = CustomSequencer;
