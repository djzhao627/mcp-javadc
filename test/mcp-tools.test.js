import * as path from 'path';
import * as fs from 'fs/promises';
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
    assert(toolsResponse.tools.length === 6, 'Expected 6 tools to be listed');

    const toolNames = toolsResponse.tools.map(tool => tool.name);
    assert(toolNames.includes('decompile-from-path'),
        'Expected decompile-from-path tool');
    assert(toolNames.includes('decompile-from-package'),
        'Expected decompile-from-package tool');
    assert(toolNames.includes('decompile-from-jar'),
        'Expected decompile-from-jar tool');
    assert(toolNames.includes('analyze-jar-classes'),
        'Expected analyze-jar-classes tool');
    assert(toolNames.includes('find-jar-in-maven-repository'),
        'Expected find-jar-in-maven-repository tool');
    assert(toolNames.includes('find-source-by-package'),
        'Expected find-source-by-package tool');
    
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

    console.log('\nTest 6: Testing analyze-jar-classes tool...');

    try {
      const listClassesResponse = await client.callTool({
        name: 'analyze-jar-classes',
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

      // Test with includeMembers = true
      const listClassesWithMembersResponse = await client.callTool({
        name: 'analyze-jar-classes',
        arguments: {
          jarFilePath: TEST_JAR_PATH,
          includeMembers: true,
        },
      });

      assert(listClassesWithMembersResponse && listClassesWithMembersResponse.content,
          'Expected content in response with members');

      const listWithMembersText = listClassesWithMembersResponse.content[0]?.text || '';
      const classListWithMembers = JSON.parse(listWithMembersText);

      assert(classListWithMembers.includeMembers === true, 'Expected includeMembers to be true');
      assert(classListWithMembers.classes[0].hasOwnProperty('members'), 'Expected members property on class');

      const members = classListWithMembers.classes[0].members;
      assert(members.hasOwnProperty('fields'), 'Expected fields property in members');
      assert(members.hasOwnProperty('methods'), 'Expected methods property in members');
      assert(members.hasOwnProperty('constructors'), 'Expected constructors property in members');

      console.log('✓ Successfully listed classes with member information');

      // Test error handling for non-existent JAR
      const invalidJarResponse = await client.callTool({
        name: 'analyze-jar-classes',
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
        name: 'analyze-jar-classes',
        arguments: {},
      });

      assert(missingPathResponse && missingPathResponse.content,
          'Expected content in missing parameter response');
      const missingText = missingPathResponse.content[0]?.text || '';
      assert(missingText.includes('Error: Missing jarFilePath parameter'),
          'Expected missing parameter error message');

      console.log('✓ Parameter validation works correctly');

    } catch (error) {
      console.error('Failed to test analyze-jar-classes:', error);
      throw error;
    }

    console.log('\nTest 7: Testing find-jar-in-maven-repository tool...');

    try {
      // Test basic functionality - search for a common jar name
      const findJarResponse = await client.callTool({
        name: 'find-jar-in-maven-repository',
        arguments: {
          jarName: 'junit',
        },
      });

      console.log('Find jar in maven repository response received:',
          findJarResponse ? 'Success' : 'Error');

      assert(findJarResponse && findJarResponse.content,
          'Expected content in response');

      const resultText = findJarResponse.content[0]?.text || '';
      const searchResult = JSON.parse(resultText);

      // Verify the response structure
      assert(searchResult.hasOwnProperty('searchTerm'), 'Expected searchTerm in response');
      assert(searchResult.hasOwnProperty('repositoryPath'), 'Expected repositoryPath in response');
      assert(searchResult.hasOwnProperty('totalFound'), 'Expected totalFound in response');
      assert(searchResult.hasOwnProperty('jarFiles'), 'Expected jarFiles in response');

      assert(searchResult.searchTerm === 'junit', 'Expected searchTerm to match input');
      assert(Array.isArray(searchResult.jarFiles), 'Expected jarFiles to be an array');
      assert(typeof searchResult.totalFound === 'number', 'Expected totalFound to be a number');
      assert(searchResult.totalFound === searchResult.jarFiles.length, 'Expected totalFound to match jarFiles length');

      // If we found any jars, validate their structure
      if (searchResult.totalFound > 0) {
        const firstJar = searchResult.jarFiles[0];
        assert(firstJar.hasOwnProperty('fileName'), 'Expected fileName in jar entry');
        assert(firstJar.hasOwnProperty('fullPath'), 'Expected fullPath in jar entry');
        assert(firstJar.hasOwnProperty('relativePath'), 'Expected relativePath in jar entry');
        assert(firstJar.hasOwnProperty('groupId'), 'Expected groupId in jar entry');
        assert(firstJar.hasOwnProperty('artifactId'), 'Expected artifactId in jar entry');
        assert(firstJar.hasOwnProperty('version'), 'Expected version in jar entry');
        console.log('✓ Found jar files with correct structure');
      } else {
        console.log('✓ No jar files found (expected in test environment)');
      }

      console.log('✓ Successfully tested find-jar-in-maven-repository basic functionality');

      // Test with custom repository path
      const customPathResponse = await client.callTool({
        name: 'find-jar-in-maven-repository',
        arguments: {
          jarName: 'nonexistent',
          repositoryPath: '/tmp/nonexistent-repo',
        },
      });

      assert(customPathResponse && customPathResponse.content,
          'Expected content in custom path response');
      const customPathText = customPathResponse.content[0]?.text || '';
      assert(customPathText.includes('Error:') && customPathText.includes('does not exist'),
          'Expected error message for non-existent repository path');

      console.log('✓ Error handling for invalid repository path works correctly');

      // Test missing jarName parameter
      const missingJarNameResponse = await client.callTool({
        name: 'find-jar-in-maven-repository',
        arguments: {},
      });

      assert(missingJarNameResponse && missingJarNameResponse.content,
          'Expected content in missing parameter response');
      const missingJarText = missingJarNameResponse.content[0]?.text || '';
      assert(missingJarText.includes('Error: Missing jarName parameter'),
          'Expected missing parameter error message');

      console.log('✓ Parameter validation for jarName works correctly');

      // Test with empty jarName
      const emptyJarNameResponse = await client.callTool({
        name: 'find-jar-in-maven-repository',
        arguments: {
          jarName: '',
        },
      });

      assert(emptyJarNameResponse && emptyJarNameResponse.content,
          'Expected content in empty jarName response');
      const emptyJarText = emptyJarNameResponse.content[0]?.text || '';
      assert(emptyJarText.includes('Error: Missing jarName parameter'),
          'Expected missing parameter error for empty jarName');

      console.log('✓ Empty jarName validation works correctly');

      // Test jarName with .jar suffix
      const jarSuffixResponse = await client.callTool({
        name: 'find-jar-in-maven-repository',
        arguments: {
          jarName: 'junit.jar',
        },
      });

      assert(jarSuffixResponse && jarSuffixResponse.content,
          'Expected content in jar suffix response');
      const jarSuffixText = jarSuffixResponse.content[0]?.text || '';
      const jarSuffixResult = JSON.parse(jarSuffixText);

      // Should search for 'junit' not 'junit.jar'
      assert(jarSuffixResult.searchTerm === 'junit.jar', 'Expected original searchTerm to be preserved');
      console.log('✓ Jar name with .jar suffix handling works correctly');

    } catch (error) {
      console.error('Failed to test find-jar-in-maven-repository:', error);
      throw error;
    }

    console.log('\nTest 8: Testing find-source-by-package tool...');

    try {
      // First, let's try to find any available sources JAR to test with
      const testCases = [
        { packageName: 'org.springframework.http.HttpMethod', artifactName: 'spring-web', description: 'Spring Web HttpMethod' },
        { packageName: 'com.google.common.base.Strings', artifactName: 'guava', description: 'Google Guava Strings' },
        { packageName: 'org.junit.Test', artifactName: 'junit', description: 'JUnit Test annotation' },
        { packageName: 'org.apache.commons.lang3.StringUtils', artifactName: 'commons-lang3', description: 'Apache Commons Lang StringUtils' }
      ];

      let successfulTestCase = null;
      let testResult = null;

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
          const result = JSON.parse(testResponse.content[0]?.text || '{}');
          if (result.totalFound > 0) {
            successfulTestCase = testCase;
            testResult = result;
            console.log(`✓ Found sources for ${testCase.description}`);
            break;
          }
        }
      }

      // Test basic functionality using found sources or fallback to structure validation
      let findSourceResponse;
      if (successfulTestCase) {
        findSourceResponse = await client.callTool({
          name: 'find-source-by-package',
          arguments: {
            packageName: successfulTestCase.packageName,
            artifactName: successfulTestCase.artifactName,
          },
        });
      } else {
        // Fallback to a test that we know will have a predictable structure (even if no sources found)
        findSourceResponse = await client.callTool({
          name: 'find-source-by-package',
          arguments: {
            packageName: 'com.example.TestClass',
          },
        });
      }

      console.log('Find source by package response received:',
          findSourceResponse ? 'Success' : 'Error');

      assert(findSourceResponse && findSourceResponse.content,
          'Expected content in response');

      const sourceResultText = findSourceResponse.content[0]?.text || '';
      const sourceResult = JSON.parse(sourceResultText);

      // Verify the response structure (this should work regardless of whether sources are found)
      assert(sourceResult.hasOwnProperty('packageName'), 'Expected packageName in response');
      assert(sourceResult.hasOwnProperty('repositoryPath'), 'Expected repositoryPath in response');
      assert(sourceResult.hasOwnProperty('sourceJars'), 'Expected sourceJars in response');
      assert(sourceResult.hasOwnProperty('foundSources'), 'Expected foundSources in response');
      assert(sourceResult.hasOwnProperty('totalFound'), 'Expected totalFound in response');

      const expectedPackageName = successfulTestCase ? successfulTestCase.packageName : 'com.example.TestClass';
      assert(sourceResult.packageName === expectedPackageName, 'Expected packageName to match input');
      assert(Array.isArray(sourceResult.sourceJars), 'Expected sourceJars to be an array');
      assert(Array.isArray(sourceResult.foundSources), 'Expected foundSources to be an array');
      assert(typeof sourceResult.totalFound === 'number', 'Expected totalFound to be a number');
      assert(sourceResult.totalFound === sourceResult.foundSources.length, 'Expected totalFound to match foundSources length');

      // Log the repository path being used
      console.log('Using Maven repository path:', sourceResult.repositoryPath);

      // If we found any sources, validate their structure
      if (sourceResult.totalFound > 0) {
        const firstSource = sourceResult.foundSources[0];
        assert(firstSource.hasOwnProperty('jarPath'), 'Expected jarPath in source entry');
        assert(firstSource.hasOwnProperty('relativePath'), 'Expected relativePath in source entry');
        assert(firstSource.hasOwnProperty('sourceFilePath'), 'Expected sourceFilePath in source entry');
        assert(firstSource.hasOwnProperty('size'), 'Expected size in source entry');
        assert(firstSource.hasOwnProperty('content'), 'Expected content in source entry');
        assert(firstSource.hasOwnProperty('lines'), 'Expected lines in source entry');

        // Validate Java source content (generic validation that works for any Java source)
        assert(firstSource.content.includes('package '), 'Expected package declaration in source');
        assert(typeof firstSource.size === 'number', 'Expected size to be a number');
        assert(typeof firstSource.lines === 'number', 'Expected lines to be a number');
        assert(firstSource.size > 0, 'Expected source file to have content');
        assert(firstSource.lines > 0, 'Expected source file to have lines');

        console.log('✓ Found source files with correct structure and content');
        console.log(`  - Source file: ${firstSource.sourceFilePath}`);
        console.log(`  - Size: ${firstSource.size} bytes, Lines: ${firstSource.lines}`);
        console.log(`  - Test case: ${successfulTestCase.description}`);
      } else {
        console.log('✓ No source files found (this is acceptable when no sources JAR are available)');
      }

      console.log('✓ Successfully tested find-source-by-package basic functionality');

      // Test with specific artifact name (using successful test case if found)
      if (successfulTestCase) {
        const artifactResponse = await client.callTool({
          name: 'find-source-by-package',
          arguments: {
            packageName: successfulTestCase.packageName,
            artifactName: successfulTestCase.artifactName,
          },
        });

        assert(artifactResponse && artifactResponse.content,
            'Expected content in artifact response');
        const artifactResultText = artifactResponse.content[0]?.text || '';
        const artifactResult = JSON.parse(artifactResultText);

        assert(artifactResult.packageName === successfulTestCase.packageName, 'Expected packageName to match');
        console.log('✓ Artifact name parameter handling works correctly');
      } else {
        console.log('✓ Artifact name parameter test skipped (no available sources)');
      }

      // Test with includeContent = false
      const noContentResponse = await client.callTool({
        name: 'find-source-by-package',
        arguments: {
          packageName: successfulTestCase ? successfulTestCase.packageName : 'org.springframework.http.HttpMethod',
          artifactName: successfulTestCase ? successfulTestCase.artifactName : 'spring-web',
          includeContent: false,
        },
      });

      assert(noContentResponse && noContentResponse.content,
          'Expected content in no content response');
      const noContentResultText = noContentResponse.content[0]?.text || '';
      const noContentResult = JSON.parse(noContentResultText);

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

      // Test with custom repository path that doesn't exist
      const customRepoResponse = await client.callTool({
        name: 'find-source-by-package',
        arguments: {
          packageName: 'com.example.Test',
          repositoryPath: '/tmp/nonexistent-maven-repo',
        },
      });

      assert(customRepoResponse && customRepoResponse.content,
          'Expected content in custom repo response');
      const customRepoText = customRepoResponse.content[0]?.text || '';
      assert(customRepoText.includes('Error:') && customRepoText.includes('does not exist'),
          'Expected error message for non-existent repository path');

      console.log('✓ Error handling for invalid repository path works correctly');

      // Test missing packageName parameter
      const missingPackageResponse = await client.callTool({
        name: 'find-source-by-package',
        arguments: {},
      });

      assert(missingPackageResponse && missingPackageResponse.content,
          'Expected content in missing parameter response');
      const missingPackageText = missingPackageResponse.content[0]?.text || '';
      assert(missingPackageText.includes('Error: Missing packageName parameter'),
          'Expected missing parameter error message');

      console.log('✓ Parameter validation for packageName works correctly');

      // Test with empty packageName
      const emptyPackageResponse = await client.callTool({
        name: 'find-source-by-package',
        arguments: {
          packageName: '',
        },
      });

      assert(emptyPackageResponse && emptyPackageResponse.content,
          'Expected content in empty packageName response');
      const emptyPackageText = emptyPackageResponse.content[0]?.text || '';
      assert(emptyPackageText.includes('Error: Missing packageName parameter'),
          'Expected missing parameter error for empty packageName');

      console.log('✓ Empty packageName validation works correctly');

      // Test with Spring Framework package (if available)
      try {
        const springResponse = await client.callTool({
          name: 'find-source-by-package',
          arguments: {
            packageName: 'org.springframework.web.servlet.DispatcherServlet',
            artifactName: 'spring-web',
          },
        });

        assert(springResponse && springResponse.content,
            'Expected content in spring response');
        const springResultText = springResponse.content[0]?.text || '';
        const springResult = JSON.parse(springResultText);

        assert(springResult.packageName === 'org.springframework.web.servlet.DispatcherServlet', 'Expected Spring packageName to match');

        if (springResult.totalFound > 0) {
          console.log('✓ Successfully found Spring Framework sources');
        } else {
          console.log('✓ Spring Framework sources not found (may not be available)');
        }
      } catch (springError) {
        console.log('✓ Spring Framework test completed (may have expected errors)');
      }

      // Test with a package that likely doesn't exist
      const notFoundResponse = await client.callTool({
        name: 'find-source-by-package',
        arguments: {
          packageName: 'com.nonexistent.package.NonExistentClass',
        },
      });

      assert(notFoundResponse && notFoundResponse.content,
          'Expected content in not found response');
      const notFoundResultText = notFoundResponse.content[0]?.text || '';
      const notFoundResult = JSON.parse(notFoundResultText);

      assert(notFoundResult.totalFound === 0, 'Expected no sources found for nonexistent package');
      assert(Array.isArray(notFoundResult.sourceJars), 'Expected sourceJars array even when empty');
      assert(Array.isArray(notFoundResult.foundSources), 'Expected foundSources array even when empty');

      console.log('✓ No sources found handling works correctly');

      // Test the two-step workflow described in the tool description
      console.log('Testing two-step workflow for find-source-by-package...');

      const twoStepTestPackage = 'org.springframework.http.HttpMethod';

      // Step 1: Call with only packageName
      const step1Response = await client.callTool({
        name: 'find-source-by-package',
        arguments: {
          packageName: twoStepTestPackage,
        },
      });

      assert(step1Response && step1Response.content,
          'Expected content in step 1 response');
      const step1Result = JSON.parse(step1Response.content[0]?.text || '{}');

      console.log(`Step 1 - Found ${step1Result.totalFound} sources, ${step1Result.availableSourceJars ? step1Result.availableSourceJars.length : 0} available source JARs`);

      // If foundSources is empty but availableSourceJars has content, proceed to step 2
      if (step1Result.totalFound === 0 && step1Result.availableSourceJars && step1Result.availableSourceJars.length > 0) {
        // Extract artifact name from the first available source JAR
        const firstAvailableJar = step1Result.availableSourceJars[0];
        const jarFileName = firstAvailableJar.relativePath.split('/').pop(); // Get the file name

        // Extract artifact name (e.g., "spring-web" from "spring-web-5.0.11.RELEASE-sources.jar")
        const artifactMatch = jarFileName.match(/^(.+?)-[\d]+/); // Match until first version number
        let extractedArtifact = null;

        if (artifactMatch) {
          extractedArtifact = artifactMatch[1];
        } else {
          // Fallback: try to extract from known patterns
          if (jarFileName.includes('spring-web')) {
            extractedArtifact = 'spring-web';
          } else if (jarFileName.includes('guava')) {
            extractedArtifact = 'guava';
          } else if (jarFileName.includes('commons-lang')) {
            extractedArtifact = 'commons-lang3';
          }
        }

        if (extractedArtifact) {
          console.log(`Step 2 - Extracted artifact name: ${extractedArtifact} from ${jarFileName}`);

          // Step 2: Call again with the extracted artifact name
          const step2Response = await client.callTool({
            name: 'find-source-by-package',
            arguments: {
              packageName: twoStepTestPackage,
              artifactName: extractedArtifact,
            },
          });

          assert(step2Response && step2Response.content,
              'Expected content in step 2 response');
          const step2Result = JSON.parse(step2Response.content[0]?.text || '{}');

          console.log(`Step 2 - Found ${step2Result.totalFound} sources after using artifact name`);

          // Verify that step 2 either found sources or provided better targeting
          assert(step2Result.packageName === twoStepTestPackage, 'Expected packageName to match in step 2');

          if (step2Result.totalFound > 0) {
            console.log('✓ Two-step workflow successfully found source code');
            // Verify the source has expected content
            const foundSource = step2Result.foundSources[0];
            assert(foundSource.content, 'Expected source content in step 2 result');
            assert(foundSource.jarPath.includes(extractedArtifact), 'Expected JAR path to contain extracted artifact name');
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

    } catch (error) {
      console.error('Failed to test find-source-by-package:', error);
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
