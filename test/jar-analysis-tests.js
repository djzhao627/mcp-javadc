import assert from 'assert';
import {
  TEST_JAR_PATH,
  assertErrorResponse,
  parseJSONResponse
} from './test-utils.js';

export async function testAnalyzeJarClasses(client) {
  console.log('\nTest 6: Testing analyze-jar-classes tool...');

  // Test basic functionality
  const listClassesResponse = await client.callTool({
    name: 'analyze-jar-classes',
    arguments: {
      jarFilePath: TEST_JAR_PATH,
    },
  });

  console.log('List classes in jar response received:',
      listClassesResponse ? 'Success' : 'Error');

  const classList = parseJSONResponse(listClassesResponse);

  assert(classList.jarPath, 'Expected jarPath in response');
  assert(classList.totalClasses === 1, 'Expected totalClasses to be 1');
  assert(Array.isArray(classList.classes), 'Expected classes to be an array');
  assert(classList.classes.length === 1, 'Expected one class in the list');
  assert(classList.classes[0].className === 'SampleClass', 'Expected SampleClass in the list');
  assert(classList.classes[0].internalPath === 'SampleClass.class', 'Expected correct internal path');

  console.log('✓ Successfully listed classes in JAR file with structured data');

  // Test with includeMembers = true
  await testAnalyzeJarWithMembers(client);

  // Test error cases
  await testAnalyzeJarErrorCases(client);

  return classList;
}

async function testAnalyzeJarWithMembers(client) {
  const listClassesWithMembersResponse = await client.callTool({
    name: 'analyze-jar-classes',
    arguments: {
      jarFilePath: TEST_JAR_PATH,
      includeMembers: true,
    },
  });

  const classListWithMembers = parseJSONResponse(listClassesWithMembersResponse);

  assert(classListWithMembers.includeMembers === true, 'Expected includeMembers to be true');
  assert(classListWithMembers.classes[0].hasOwnProperty('members'), 'Expected members property on class');

  const members = classListWithMembers.classes[0].members;
  assert(members.hasOwnProperty('fields'), 'Expected fields property in members');
  assert(members.hasOwnProperty('methods'), 'Expected methods property in members');
  assert(members.hasOwnProperty('constructors'), 'Expected constructors property in members');

  console.log('✓ Successfully listed classes with member information');
  return classListWithMembers;
}

async function testAnalyzeJarErrorCases(client) {
  // Test error handling for non-existent JAR
  const invalidJarResponse = await client.callTool({
    name: 'analyze-jar-classes',
    arguments: {
      jarFilePath: '/path/to/nonexistent.jar',
    },
  });

  assertErrorResponse(invalidJarResponse);
  console.log('✓ Error handling for invalid JAR works correctly');

  // Test missing jarFilePath parameter
  const missingPathResponse = await client.callTool({
    name: 'analyze-jar-classes',
    arguments: {},
  });

  assertErrorResponse(missingPathResponse, 'Error: Missing jarFilePath parameter');
  console.log('✓ Parameter validation works correctly');
}
