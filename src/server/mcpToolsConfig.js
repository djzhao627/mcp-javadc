export const tools = [
  {
    name: 'decompile-from-path',
    description: 'Decompiles a Java .class file from a given file path',
    inputSchema: {
      type: 'object',
      properties: {
        classFilePath: {
          type: 'string',
          description: 'The absolute path to the .class file',
        },
      },
      required: ['classFilePath'],
    },
  },
  {
    name: 'decompile-from-package',
    description: 'Decompiles a Java class from a package name',
    inputSchema: {
      type: 'object',
      properties: {
        packageName: {
          type: 'string',
          description: 'Fully qualified Java package and class name',
        },
        classpath: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Array of classpath directories to search',
        },
      },
      required: ['packageName'],
    },
  },
  {
    name: 'decompile-from-jar',
    description: `Decompiles a Java class from a JAR file

# Using mcp_javadc with Maven Repository

When you need to decompile Java classes from dependencies in the M2 repository, follow these steps:

## Step 1: Find the JAR file location

First, search for the dependency JAR in the local Maven repository:

\`\`\`bash
find ~/.m2 -name "*dependency-name*jar" | grep -v source | grep -v javadoc
\`\`\`

Notes:
- Replace dependency-name with the artifact name
- Filter out source and javadoc JARs using grep
- Look for the correct version based on the project's POM file

## Step 2: Use the correct mcp_javadc function

Once you have the JAR path, use this function:

For specific class decompilation:
- jarFilePath: The absolute path to the JAR (from Step 1)
- className: Fully qualified class name to decompile

For contextual exploration:
If needed, first try to find all available classes in the JAR:
\`jar tf /path/to/the.jar | grep .class | sort\`

Example workflow:
1. Read the POM file to identify dependency version
2. Search the M2 repository for the JAR
3. Use mcp_javadc to decompile relevant classes
4. If multiple versions exist, select the one matching the project's version requirement`,
    inputSchema: {
      type: 'object',
      properties: {
        jarFilePath: {
          type: 'string',
          description: 'The absolute path to the JAR file',
        },
        className: {
          type: 'string',
          description:
            'Fully qualified class name to decompile from the JAR (e.g., "com.example.MyClass")',
        },
      },
      required: ['jarFilePath', 'className'],
    },
  },
  {
    name: 'analyze-jar-classes',
    description:
      'Analyzes Java classes contained in a JAR file and returns structured JSON data with jarPath, totalClasses count, and classes array containing className and internalPath for each class. Optionally includes detailed member information (fields, methods, constructors) for each class when includeMembers is true.',
    inputSchema: {
      type: 'object',
      properties: {
        jarFilePath: {
          type: 'string',
          description: 'The absolute path to the JAR file',
        },
        includeMembers: {
          type: 'boolean',
          description:
            'Whether to include detailed member information (fields, methods, constructors) for each class. Defaults to false for performance.',
        },
      },
      required: ['jarFilePath'],
    },
  },
  {
    name: 'find-jar-in-maven-repository',
    description:
      'Searches for JAR files in the Maven repository by name and returns detailed information including full paths, group IDs, artifact IDs, and versions',
    inputSchema: {
      type: 'object',
      properties: {
        jarName: {
          type: 'string',
          description:
            'The JAR file name to search for (partial matches supported, .jar suffix will be automatically handled)',
        },
        repositoryPath: {
          type: 'string',
          description: 'Custom path to Maven repository (defaults to ~/.m2/repository)',
        },
      },
      required: ['jarName'],
    },
  },
  {
    name: 'find-source-by-package',
    description: `Finds and returns Java source code from Maven repository sources JAR files by package name.

# Usage Strategy:

## Step 1: Initial Search
First call with only packageName to get available sources:
- If foundSources is empty but availableSourceJars contains results, proceed to Step 2
- If foundSources contains results, you have the source code

## Step 2: Refined Search with Artifact Name
If initial search returns no sources but shows availableSourceJars, extract the artifact name from the JAR path and call again:
- Look at availableSourceJars results
- Extract artifact name from JAR path (e.g., "spring-web" from "spring-web-5.0.11.RELEASE-sources.jar")
- Call again with the extracted artifactName parameter

Example workflow:
1. Call with packageName: "org.springframework.http.HttpMethod"
2. If no results but availableSourceJars shows "spring-web-5.0.11.RELEASE-sources.jar"
3. Call again with packageName: "org.springframework.http.HttpMethod" and artifactName: "spring-web"
4. This should return the actual source code in foundSources

The artifactName parameter significantly improves search precision by targeting specific Maven artifacts.`,
    inputSchema: {
      type: 'object',
      properties: {
        packageName: {
          type: 'string',
          description: 'Fully qualified Java package and class name (e.g., "com.example.MyClass")',
        },
        artifactName: {
          type: 'string',
          description:
            'Maven artifact name for precise targeting (e.g., "spring-web", "guava"). Extract from availableSourceJars if initial search returns no results.',
        },
        repositoryPath: {
          type: 'string',
          description: 'Custom path to Maven repository (defaults to ~/.m2/repository)',
        },
        includeContent: {
          type: 'boolean',
          description:
            'Whether to include the full source file content in the response (defaults to true)',
        },
      },
      required: ['packageName'],
    },
  },
];
