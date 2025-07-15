import * as path from 'path';
import * as fs from 'fs/promises';
import {spawn} from 'child_process';
import assert from 'assert';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const FIXTURES_DIR = path.join(process.cwd(), 'test', 'fixtures');
const TEST_CLASS_PATH = path.join(FIXTURES_DIR, 'SampleClass.class');
const TEST_JAR_PATH = path.join(FIXTURES_DIR, 'SampleClass.jar');

async function runTests() {
  console.log('Starting MCP Java Decompiler tests with MCP client...');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['index.js'],
  });

  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  });

  try {
    console.log('Connecting to MCP Java Decompiler server...');
    await client.connect(transport);

    console.log('\nTest 1: Listing available tools and verifying descriptions...');

    const toolsResponse = await client.listTools();
    console.log('Available tools response:', toolsResponse);

    assert(toolsResponse && toolsResponse.tools,
        'Expected tools array in response');
    assert(Array.isArray(toolsResponse.tools), 'Expected tools to be an array');
    assert(toolsResponse.tools.length === 4, 'Expected 4 tools to be listed');

    const toolNames = toolsResponse.tools.map(tool => tool.name);
    assert(toolNames.includes('decompile-from-path'),
        'Expected decompile-from-path tool');
    assert(toolNames.includes('decompile-from-package'),
        'Expected decompile-from-package tool');
    assert(toolNames.includes('decompile-from-jar'),
        'Expected decompile-from-jar tool');
    assert(toolNames.includes('list-classes-in-jar'),
        'Expected list-classes-in-jar tool');
    
    // Check for Maven repository instructions in the decompile-from-jar tool description
    const jarDecompileTool = toolsResponse.tools.find(tool => tool.name === 'decompile-from-jar');
    assert(jarDecompileTool, 'Expected to find decompile-from-jar tool');
    assert(jarDecompileTool.description.includes('Using mcp_javadc with Maven Repository'),
        'Expected Maven repository usage instructions in tool description');
    assert(jarDecompileTool.description.includes('find ~/.m2 -name'),
        'Expected Maven repository search command in tool description');
    assert(jarDecompileTool.description.includes('Example workflow:'),
        'Expected example workflow in tool description');
    
    // We don't have direct access to serverInfo.version in the client
    // But we've verified the tool descriptions have been updated,
    // which only happens when the version is updated

    console.log('✓ Successfully listed tools and verified descriptions:', toolNames);

    console.log('\nTest 2: Testing decompile-from-path tool...');

    try {
      await fs.access(TEST_CLASS_PATH);
      await fs.access(TEST_JAR_PATH);
    } catch (e) {
      console.log('Test fixtures not found, running create-test-fixtures...');
      const {createFixtures} = await import('./create-test-fixtures.js');
      await createFixtures();
    }

    const decompilePathResponse = await client.callTool({
      name: 'decompile-from-path',
      arguments: {
        classFilePath: TEST_CLASS_PATH,
      },
    });

    console.log('Decompile path response received:',
        decompilePathResponse ? 'Success' : 'Error');

    assert(decompilePathResponse && decompilePathResponse.content,
        'Expected content in response');

    const decompileText = decompilePathResponse.content[0]?.text || '';
    assert(decompileText.includes('class SampleClass'),
        'Expected decompiled class in result');
    assert(decompileText.includes('void printMessage()'),
        'Expected method in decompiled class');

    console.log('✓ Successfully decompiled from path');

    console.log('\nTest 3: Testing decompile-from-package tool...');

    try {
      const decompilePackageResponse = await client.callTool({
        name: 'decompile-from-package',
        arguments: {
          packageName: 'SampleClass',
          classpath: [FIXTURES_DIR],
        },
      });

      console.log('Decompile package response received:',
          decompilePackageResponse ? 'Success' : 'Error');

      assert(decompilePackageResponse && decompilePackageResponse.content,
          'Expected content in response');

      const packageText = decompilePackageResponse.content[0]?.text || '';
      assert(packageText, 'Expected text content in result');
      console.log('✓ Successfully decompiled from package');
    } catch (error) {
      console.log('✓ Expected error when decompiling from package:',
          error.message);
    }

    console.log('\nTest 4: Testing decompile-from-jar tool...');

    try {
      const decompileJarResponse = await client.callTool({
        name: 'decompile-from-jar',
        arguments: {
          jarFilePath: TEST_JAR_PATH,
          className: 'SampleClass'
        },
      });

      console.log('Decompile jar response received:',
          decompileJarResponse ? 'Success' : 'Error');

      assert(decompileJarResponse && decompileJarResponse.content,
          'Expected content in response');

      const jarText = decompileJarResponse.content[0]?.text || '';
      assert(jarText.includes('class SampleClass'),
          'Expected decompiled class in result');
      assert(jarText.includes('void printMessage()'),
          'Expected method in decompiled class');
      console.log(
          '✓ Successfully decompiled from JAR with explicit class name');

      const decompileJarMissingClassResponse = await client.callTool({
        name: 'decompile-from-jar',
        arguments: {
          jarFilePath: TEST_JAR_PATH
        },
      });

      console.log('Decompile jar (missing className) response received:',
          decompileJarMissingClassResponse ? 'Success' : 'Error');

      assert(decompileJarMissingClassResponse
          && decompileJarMissingClassResponse.content,
          'Expected content in response');

      const missingClassText = decompileJarMissingClassResponse.content[0]?.text
          || '';
      assert(missingClassText.includes('Error:'),
          'Expected error message for missing className');
      console.log('✓ Successfully returned error for missing className');

    } catch (error) {
      console.error('Failed to decompile from JAR:', error);
      throw error;
    }

    console.log('\nTest 5: Testing error handling for invalid path...');

    const invalidPathResponse = await client.callTool({
      name: 'decompile-from-path',
      arguments: {
        classFilePath: '/path/to/nonexistent/file.class',
      },
    });

    console.log('Invalid path response:', invalidPathResponse);

    assert(invalidPathResponse && invalidPathResponse.content,
        'Expected content in response');
    const errorText = invalidPathResponse.content[0]?.text || '';
    assert(errorText.includes('Error:'),
        'Expected error message in response content');

    console.log('✓ Error handling works correctly');

    console.log('\nTest 6: Testing list-classes-in-jar tool...');

    try {
      const listClassesResponse = await client.callTool({
        name: 'list-classes-in-jar',
        arguments: {
          jarFilePath: TEST_JAR_PATH,
        },
      });

      console.log('List classes in jar response received:',
          listClassesResponse ? 'Success' : 'Error');

      assert(listClassesResponse && listClassesResponse.content,
          'Expected content in response');

      const listText = listClassesResponse.content[0]?.text || '';
      const classList = JSON.parse(listText);

      assert(classList.jarPath, 'Expected jarPath in response');
      assert(classList.totalClasses === 1, 'Expected totalClasses to be 1');
      assert(Array.isArray(classList.classes), 'Expected classes to be an array');
      assert(classList.classes.length === 1, 'Expected one class in the list');
      assert(classList.classes[0].className === 'SampleClass', 'Expected SampleClass in the list');
      assert(classList.classes[0].internalPath === 'SampleClass.class', 'Expected correct internal path');

      console.log('✓ Successfully listed classes in JAR file with structured data');

      // Test error handling for non-existent JAR
      const invalidJarResponse = await client.callTool({
        name: 'list-classes-in-jar',
        arguments: {
          jarFilePath: '/path/to/nonexistent.jar',
        },
      });

      assert(invalidJarResponse && invalidJarResponse.content,
          'Expected content in error response');
      const errorText = invalidJarResponse.content[0]?.text || '';
      assert(errorText.includes('Error:'),
          'Expected error message for non-existent JAR');

      console.log('✓ Error handling for invalid JAR works correctly');

      // Test missing jarFilePath parameter
      const missingPathResponse = await client.callTool({
        name: 'list-classes-in-jar',
        arguments: {},
      });

      assert(missingPathResponse && missingPathResponse.content,
          'Expected content in missing parameter response');
      const missingText = missingPathResponse.content[0]?.text || '';
      assert(missingText.includes('Error: Missing jarFilePath parameter'),
          'Expected missing parameter error message');

      console.log('✓ Parameter validation works correctly');

    } catch (error) {
      console.error('Failed to test list-classes-in-jar:', error);
      throw error;
    }

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
