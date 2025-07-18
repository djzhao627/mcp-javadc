import assert from 'assert';
import {
  assertErrorResponse,
  parseJSONResponse
} from './test-utils.js';

export async function testFindJarInMavenRepository(client) {
  console.log('\nTest 7: Testing find-jar-in-maven-repository tool...');

  // Test basic functionality - search for a common jar name
  const findJarResponse = await client.callTool({
    name: 'find-jar-in-maven-repository',
    arguments: {
      jarName: 'junit',
    },
  });

  console.log('Find jar in maven repository response received:',
      findJarResponse ? 'Success' : 'Error');

  const searchResult = parseJSONResponse(findJarResponse);

  // Verify the response structure
  validateJarSearchResult(searchResult, 'junit');

  console.log('✓ Successfully tested find-jar-in-maven-repository basic functionality');

  // Test various error cases and edge cases
  await testFindJarErrorCases(client);

  return searchResult;
}

function validateJarSearchResult(searchResult, expectedSearchTerm) {
  assert(searchResult.hasOwnProperty('searchTerm'), 'Expected searchTerm in response');
  assert(searchResult.hasOwnProperty('repositoryPath'), 'Expected repositoryPath in response');
  assert(searchResult.hasOwnProperty('totalFound'), 'Expected totalFound in response');
  assert(searchResult.hasOwnProperty('jarFiles'), 'Expected jarFiles in response');

  assert(searchResult.searchTerm === expectedSearchTerm, 'Expected searchTerm to match input');
  assert(Array.isArray(searchResult.jarFiles), 'Expected jarFiles to be an array');
  assert(typeof searchResult.totalFound === 'number', 'Expected totalFound to be a number');
  assert(searchResult.totalFound === searchResult.jarFiles.length, 'Expected totalFound to match jarFiles length');

  // If we found any jars, validate their structure
  if (searchResult.totalFound > 0) {
    const firstJar = searchResult.jarFiles[0];
    const expectedProperties = ['fileName', 'fullPath', 'relativePath', 'groupId', 'artifactId', 'version'];
    expectedProperties.forEach(prop => {
      assert(firstJar.hasOwnProperty(prop), `Expected ${prop} in jar entry`);
    });
    console.log('✓ Found jar files with correct structure');
  } else {
    console.log('✓ No jar files found (expected in test environment)');
  }
}

async function testFindJarErrorCases(client) {
  // Test with custom repository path that doesn't exist
  const customPathResponse = await client.callTool({
    name: 'find-jar-in-maven-repository',
    arguments: {
      jarName: 'nonexistent',
      repositoryPath: '/tmp/nonexistent-repo',
    },
  });

  const customPathText = assertErrorResponse(customPathResponse);
  assert(customPathText.includes('does not exist'), 'Expected "does not exist" in error message');
  console.log('✓ Error handling for invalid repository path works correctly');

  // Test missing jarName parameter
  const missingJarNameResponse = await client.callTool({
    name: 'find-jar-in-maven-repository',
    arguments: {},
  });

  assertErrorResponse(missingJarNameResponse, 'Error: Missing jarName parameter');
  console.log('✓ Parameter validation for jarName works correctly');

  // Test with empty jarName
  const emptyJarNameResponse = await client.callTool({
    name: 'find-jar-in-maven-repository',
    arguments: {
      jarName: '',
    },
  });

  assertErrorResponse(emptyJarNameResponse, 'Error: Missing jarName parameter');
  console.log('✓ Empty jarName validation works correctly');

  // Test jarName with .jar suffix
  const jarSuffixResponse = await client.callTool({
    name: 'find-jar-in-maven-repository',
    arguments: {
      jarName: 'junit.jar',
    },
  });

  const jarSuffixResult = parseJSONResponse(jarSuffixResponse);
  assert(jarSuffixResult.searchTerm === 'junit.jar', 'Expected original searchTerm to be preserved');
  console.log('✓ Jar name with .jar suffix handling works correctly');
}

export async function testFindSourceByPackage(client) {
  console.log('\nTest 8: Testing find-source-by-package tool...');

  const testCases = [
    { packageName: 'org.springframework.http.HttpMethod', artifactName: 'spring-web', description: 'Spring Web HttpMethod' },
    { packageName: 'com.google.common.base.Strings', artifactName: 'guava', description: 'Google Guava Strings' },
    { packageName: 'org.junit.Test', artifactName: 'junit', description: 'JUnit Test annotation' },
    { packageName: 'org.apache.commons.lang3.StringUtils', artifactName: 'commons-lang3', description: 'Apache Commons Lang StringUtils' }
  ];

  const successfulTestCase = await findWorkingTestCase(client, testCases);

  // Test basic functionality
  const testPackageName = successfulTestCase ? successfulTestCase.packageName : 'com.example.TestClass';
  const testArtifactName = successfulTestCase ? successfulTestCase.artifactName : undefined;

  const findSourceResponse = await client.callTool({
    name: 'find-source-by-package',
    arguments: {
      packageName: testPackageName,
      artifactName: testArtifactName,
    },
  });

  console.log('Find source by package response received:', findSourceResponse ? 'Success' : 'Error');

  const sourceResult = parseJSONResponse(findSourceResponse);
  validateSourceSearchResult(sourceResult, testPackageName, successfulTestCase);

  // Test additional scenarios
  await testFindSourceErrorCases(client);
  await testFindSourceEdgeCases(client, successfulTestCase);
  await testTwoStepWorkflow(client);

  console.log('✓ Successfully completed all find-source-by-package tests');
  return sourceResult;
}

async function findWorkingTestCase(client, testCases) {
  let successfulTestCase = null;

  // Try each test case until we find one that works
  for (const testCase of testCases) {
    const testResponse = await client.callTool({
      name: 'find-source-by-package',
      arguments: {
        packageName: testCase.packageName,
        artifactName: testCase.artifactName,
      },
    });

    if (testResponse && testResponse.content) {
      const result = parseJSONResponse(testResponse);
      if (result.totalFound > 0) {
        successfulTestCase = testCase;
        console.log(`✓ Found sources for ${testCase.description}`);
        break;
      }
    }
  }

  return successfulTestCase;
}

function validateSourceSearchResult(sourceResult, expectedPackageName, successfulTestCase) {
  // Verify the response structure
  const expectedProperties = ['packageName', 'repositoryPath', 'sourceJars', 'foundSources', 'totalFound'];
  expectedProperties.forEach(prop => {
    assert(sourceResult.hasOwnProperty(prop), `Expected ${prop} in response`);
  });

  assert(sourceResult.packageName === expectedPackageName, 'Expected packageName to match input');
  assert(Array.isArray(sourceResult.sourceJars), 'Expected sourceJars to be an array');
  assert(Array.isArray(sourceResult.foundSources), 'Expected foundSources to be an array');
  assert(typeof sourceResult.totalFound === 'number', 'Expected totalFound to be a number');
  assert(sourceResult.totalFound === sourceResult.foundSources.length, 'Expected totalFound to match foundSources length');

  console.log('Using Maven repository path:', sourceResult.repositoryPath);

  // If we found any sources, validate their structure
  if (sourceResult.totalFound > 0) {
    const firstSource = sourceResult.foundSources[0];
    const expectedSourceProps = ['jarPath', 'relativePath', 'sourceFilePath', 'size', 'content', 'lines'];
    expectedSourceProps.forEach(prop => {
      assert(firstSource.hasOwnProperty(prop), `Expected ${prop} in source entry`);
    });

    // Validate Java source content
    assert(firstSource.content.includes('package '), 'Expected package declaration in source');
    assert(typeof firstSource.size === 'number', 'Expected size to be a number');
    assert(typeof firstSource.lines === 'number', 'Expected lines to be a number');
    assert(firstSource.size > 0, 'Expected source file to have content');
    assert(firstSource.lines > 0, 'Expected source file to have lines');

    console.log('✓ Found source files with correct structure and content');
    console.log(`  - Source file: ${firstSource.sourceFilePath}`);
    console.log(`  - Size: ${firstSource.size} bytes, Lines: ${firstSource.lines}`);
    if (successfulTestCase) {
      console.log(`  - Test case: ${successfulTestCase.description}`);
    }
  } else {
    console.log('✓ No source files found (this is acceptable when no sources JAR are available)');
  }
}

async function testFindSourceErrorCases(client) {
  // Test with custom repository path that doesn't exist
  const customRepoResponse = await client.callTool({
    name: 'find-source-by-package',
    arguments: {
      packageName: 'com.example.Test',
      repositoryPath: '/tmp/nonexistent-maven-repo',
    },
  });

  const customRepoText = assertErrorResponse(customRepoResponse);
  assert(customRepoText.includes('does not exist'), 'Expected "does not exist" in error message');
  console.log('✓ Error handling for invalid repository path works correctly');

  // Test missing packageName parameter
  const missingPackageResponse = await client.callTool({
    name: 'find-source-by-package',
    arguments: {},
  });

  assertErrorResponse(missingPackageResponse, 'Error: Missing packageName parameter');
  console.log('✓ Parameter validation for packageName works correctly');

  // Test with empty packageName
  const emptyPackageResponse = await client.callTool({
    name: 'find-source-by-package',
    arguments: {
      packageName: '',
    },
  });

  assertErrorResponse(emptyPackageResponse, 'Error: Missing packageName parameter');
  console.log('✓ Empty packageName validation works correctly');
}

async function testFindSourceEdgeCases(client, successfulTestCase) {
  // Test with includeContent = false
  const packageName = successfulTestCase ? successfulTestCase.packageName : 'org.springframework.http.HttpMethod';
  const artifactName = successfulTestCase ? successfulTestCase.artifactName : 'spring-web';

  const noContentResponse = await client.callTool({
    name: 'find-source-by-package',
    arguments: {
      packageName,
      artifactName,
      includeContent: false,
    },
  });

  const noContentResult = parseJSONResponse(noContentResponse);

  // If sources are found, they should not include content
  if (noContentResult.totalFound > 0) {
    const firstSource = noContentResult.foundSources[0];
    assert(!firstSource.hasOwnProperty('content'), 'Expected no content when includeContent=false');
    assert(!firstSource.hasOwnProperty('lines'), 'Expected no lines when includeContent=false');
    assert(!firstSource.hasOwnProperty('packageDeclaration'), 'Expected no packageDeclaration when includeContent=false');
    console.log('✓ includeContent=false parameter works correctly');
  } else {
    console.log('✓ includeContent=false parameter handled (no sources found)');
  }

  // Test with a package that likely doesn't exist
  const notFoundResponse = await client.callTool({
    name: 'find-source-by-package',
    arguments: {
      packageName: 'com.nonexistent.package.NonExistentClass',
    },
  });

  const notFoundResult = parseJSONResponse(notFoundResponse);
  assert(notFoundResult.totalFound === 0, 'Expected no sources found for nonexistent package');
  assert(Array.isArray(notFoundResult.sourceJars), 'Expected sourceJars array even when empty');
  assert(Array.isArray(notFoundResult.foundSources), 'Expected foundSources array even when empty');

  console.log('✓ No sources found handling works correctly');
}

async function testTwoStepWorkflow(client) {
  console.log('Testing two-step workflow for find-source-by-package...');

  const twoStepTestPackage = 'org.springframework.http.HttpMethod';

  // Step 1: Call with only packageName
  const step1Response = await client.callTool({
    name: 'find-source-by-package',
    arguments: {
      packageName: twoStepTestPackage,
    },
  });

  const step1Result = parseJSONResponse(step1Response);
  console.log(`Step 1 - Found ${step1Result.totalFound} sources, ${step1Result.availableSourceJars ? step1Result.availableSourceJars.length : 0} available source JARs`);

  // If foundSources is empty but availableSourceJars has content, proceed to step 2
  if (step1Result.totalFound === 0 && step1Result.availableSourceJars && step1Result.availableSourceJars.length > 0) {
    const extractedArtifact = extractArtifactName(step1Result.availableSourceJars[0]);

    if (extractedArtifact) {
      console.log(`Step 2 - Extracted artifact name: ${extractedArtifact.name} from ${extractedArtifact.fileName}`);

      // Step 2: Call again with the extracted artifact name
      const step2Response = await client.callTool({
        name: 'find-source-by-package',
        arguments: {
          packageName: twoStepTestPackage,
          artifactName: extractedArtifact.name,
        },
      });

      const step2Result = parseJSONResponse(step2Response);
      console.log(`Step 2 - Found ${step2Result.totalFound} sources after using artifact name`);

      assert(step2Result.packageName === twoStepTestPackage, 'Expected packageName to match in step 2');

      if (step2Result.totalFound > 0) {
        console.log('✓ Two-step workflow successfully found source code');
        const foundSource = step2Result.foundSources[0];
        assert(foundSource.content, 'Expected source content in step 2 result');
        assert(foundSource.jarPath.includes(extractedArtifact.name), 'Expected JAR path to contain extracted artifact name');
      } else {
        console.log('✓ Two-step workflow completed (source may not be available in this environment)');
      }
    } else {
      console.log('✓ Two-step workflow test: Could not extract artifact name from available JARs');
    }
  } else if (step1Result.totalFound > 0) {
    console.log('✓ Two-step workflow test: Step 1 already found sources, no need for step 2');
  } else {
    console.log('✓ Two-step workflow test: No available source JARs found in step 1');
  }

  console.log('✓ Two-step workflow testing completed');
}

function extractArtifactName(availableJar) {
  const jarFileName = availableJar.relativePath.split('/').pop();

  // Extract artifact name (e.g., "spring-web" from "spring-web-5.0.11.RELEASE-sources.jar")
  const artifactMatch = jarFileName.match(/^(.+?)-[\d]+/); // Match until first version number

  if (artifactMatch) {
    return { name: artifactMatch[1], fileName: jarFileName };
  }

  // Fallback: try to extract from known patterns
  const knownPatterns = [
    { pattern: 'spring-web', artifact: 'spring-web' },
    { pattern: 'guava', artifact: 'guava' },
    { pattern: 'commons-lang', artifact: 'commons-lang3' }
  ];

  for (const { pattern, artifact } of knownPatterns) {
    if (jarFileName.includes(pattern)) {
      return { name: artifact, fileName: jarFileName };
    }
  }

  return null;
}
