/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {'\\.js$': 'babel-jest'},
  //transformIgnorePatterns: ["/node_modules/(?!)/"],
};