import { createMCPClient, ensureTestFixtures } from './test-utils.js';
import {
  testToolsListing,
  testDecompileFromPath,
  testDecompileFromPackage,
  testDecompileFromJar,
  testErrorHandling
} from './decompile-tests.js';
import { testAnalyzeJarClasses } from './jar-analysis-tests.js';
import {
  testFindJarInMavenRepository,
  testFindSourceByPackage
} from './maven-repository-tests.js';

async function runTests() {
  console.log('Starting MCP Java Decompiler tests with MCP client...');

  let client = null;
  let transport = null;

  try {
    console.log('Connecting to MCP Java Decompiler server...');
    ({ client, transport } = await createMCPClient());

    // Ensure test fixtures are available
    await ensureTestFixtures();

    // Run all test suites
    await testToolsListing(client);
    await testDecompileFromPath(client);
    await testDecompileFromPackage(client);
    await testDecompileFromJar(client);
    await testErrorHandling(client);
    await testAnalyzeJarClasses(client);
    await testFindJarInMavenRepository(client);
    await testFindSourceByPackage(client);

    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
    process.exitCode = 1;
  } finally {
    if (transport) {
      try {
        await transport.close();
        console.log('Closed transport to MCP server');
      } catch (error) {
        console.error('Error closing transport:', error);
      }
    }
  }
}

runTests().catch(err => {
  console.error('Unhandled error:', err);
  process.exitCode = 1;
});
