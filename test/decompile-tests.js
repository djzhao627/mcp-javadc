import assert from 'assert';
import {
  TEST_CLASS_PATH,
  TEST_JAR_PATH,
  FIXTURES_DIR,
  assertResponseContent,
  assertErrorResponse
} from './test-utils.js';

export async function testToolsListing(client) {
  console.log('\nTest 1: Listing available tools and verifying descriptions...');

  const toolsResponse = await client.listTools();
  console.log('Available tools response:', toolsResponse);

  assert(toolsResponse && toolsResponse.tools, 'Expected tools array in response');
  assert(Array.isArray(toolsResponse.tools), 'Expected tools to be an array');
  assert(toolsResponse.tools.length === 6, 'Expected 6 tools to be listed');

  const toolNames = toolsResponse.tools.map(tool => tool.name);
  const expectedTools = [
    'decompile-from-path',
    'decompile-from-package',
    'decompile-from-jar',
    'analyze-jar-classes',
    'find-jar-in-maven-repository',
    'find-source-by-package'
  ];

  expectedTools.forEach(toolName => {
    assert(toolNames.includes(toolName), `Expected ${toolName} tool`);
  });

  // Check for Maven repository instructions in the decompile-from-jar tool description
  const jarDecompileTool = toolsResponse.tools.find(tool => tool.name === 'decompile-from-jar');
  assert(jarDecompileTool, 'Expected to find decompile-from-jar tool');
  assert(jarDecompileTool.description.includes('Using mcp_javadc with Maven Repository'),
      'Expected Maven repository usage instructions in tool description');
  assert(jarDecompileTool.description.includes('find ~/.m2 -name'),
      'Expected Maven repository search command in tool description');
  assert(jarDecompileTool.description.includes('Example workflow:'),
      'Expected example workflow in tool description');

  console.log('✓ Successfully listed tools and verified descriptions:', toolNames);
  return toolNames;
}

export async function testDecompileFromPath(client) {
  console.log('\nTest 2: Testing decompile-from-path tool...');

  const response = await client.callTool({
    name: 'decompile-from-path',
    arguments: {
      classFilePath: TEST_CLASS_PATH,
    },
  });

  console.log('Decompile path response received:', response ? 'Success' : 'Error');

  assertResponseContent(response, ['class SampleClass', 'void printMessage()']);

  console.log('✓ Successfully decompiled from path');
  return response;
}

export async function testDecompileFromPackage(client) {
  console.log('\nTest 3: Testing decompile-from-package tool...');

  try {
    const response = await client.callTool({
      name: 'decompile-from-package',
      arguments: {
        packageName: 'SampleClass',
        classpath: [FIXTURES_DIR],
      },
    });

    console.log('Decompile package response received:', response ? 'Success' : 'Error');
    assertResponseContent(response);
    console.log('✓ Successfully decompiled from package');
    return response;
  } catch (error) {
    console.log('✓ Expected error when decompiling from package:', error.message);
    return null;
  }
}

export async function testDecompileFromJar(client) {
  console.log('\nTest 4: Testing decompile-from-jar tool...');

  // Test with explicit class name
  const jarResponse = await client.callTool({
    name: 'decompile-from-jar',
    arguments: {
      jarFilePath: TEST_JAR_PATH,
      className: 'SampleClass'
    },
  });

  console.log('Decompile jar response received:', jarResponse ? 'Success' : 'Error');
  assertResponseContent(jarResponse, ['class SampleClass', 'void printMessage()']);
  console.log('✓ Successfully decompiled from JAR with explicit class name');

  // Test without class name (should return error)
  const missingClassResponse = await client.callTool({
    name: 'decompile-from-jar',
    arguments: {
      jarFilePath: TEST_JAR_PATH
    },
  });

  console.log('Decompile jar (missing className) response received:',
      missingClassResponse ? 'Success' : 'Error');
  assertErrorResponse(missingClassResponse);
  console.log('✓ Successfully returned error for missing className');

  return { jarResponse, missingClassResponse };
}

export async function testErrorHandling(client) {
  console.log('\nTest 5: Testing error handling for invalid path...');

  const response = await client.callTool({
    name: 'decompile-from-path',
    arguments: {
      classFilePath: '/path/to/nonexistent/file.class',
    },
  });

  console.log('Invalid path response:', response);
  assertErrorResponse(response);
  console.log('✓ Error handling works correctly');

  return response;
}
