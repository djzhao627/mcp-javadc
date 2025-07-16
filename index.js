#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs/promises';
import { decompile } from '@run-slicer/cfr';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';

const SERVER_NAME = 'javadc';
const PACKAGE_VERSION = '1.2.4';

class DecompilerService {
  async decompileFromPath(classFilePath) {
    try {
      await fs.access(classFilePath);

      // Check if the file is a JAR
      const isJar = classFilePath.toLowerCase().endsWith('.jar');

      if (isJar) {
        throw new Error(
          'JAR files must be decompiled using decompileFromJar with className parameter'
        );
      }

      // Regular class file decompilation
      const classData = await fs.readFile(classFilePath);
      const internalName = this.getInternalNameFromPath(classFilePath);

      const decompiled = await decompile(internalName, {
        source: async name => {
          if (name === internalName) {
            return classData;
          }
          if (name.startsWith('java/lang/')) {
            return Buffer.from([]);
          }
          return null;
        },
        options: {
          hidelangimports: 'true',
          showversion: 'false',
        },
      });

      return decompiled;
    } catch (error) {
      throw new Error(`Failed to decompile class file: ${error.message}`);
    }
  }

  async decompileFromJar(jarFilePath, className) {
    if (!className) {
      throw new Error('Class name must be specified for JAR decompilation');
    }

    // Create a temporary directory for extraction
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'javadc-'));
    const execPromise = promisify(exec);

    try {
      // Extract the list of class files in the JAR
      const { stdout } = await execPromise(`jar tf "${jarFilePath}" | grep ".class$"`);
      const classFiles = stdout.trim().split('\n');

      if (classFiles.length === 0) {
        throw new Error('No class files found in the JAR file');
      }

      // Extract all class files - switch to current directory then extract
      await execPromise(`cd "${tempDir}" && jar xf "${jarFilePath}"`);

      // Determine which class to decompile
      let targetClassFile = null;
      let internalName = null;

      // Convert package.class notation to internal format (with /)
      internalName = className.replace(/\./g, '/');
      targetClassFile = internalName + '.class';

      // Check if the class exists in the JAR
      const classExists = classFiles.some(cf => cf.trim() === targetClassFile);
      if (!classExists) {
        throw new Error(`Class '${className}' not found in JAR file`);
      }

      const extractedClassPath = path.join(tempDir, targetClassFile);

      // Read the class data
      const classData = await fs.readFile(extractedClassPath);

      // Decompile the class
      const decompiled = await decompile(internalName, {
        source: async name => {
          if (name === internalName) {
            return classData;
          }

          // Handle other class references from the JAR
          const otherClassFile = name + '.class';
          const otherClassPath = path.join(tempDir, otherClassFile);

          try {
            return await fs.readFile(otherClassPath);
          } catch {
            if (name.startsWith('java/lang/')) {
              return Buffer.from([]);
            }
            return null;
          }
        },
        options: {
          hidelangimports: 'true',
          showversion: 'false',
        },
      });

      return decompiled;
    } catch (error) {
      throw new Error(`Failed to decompile JAR file: ${error.message}`);
    } finally {
      // Clean up temporary directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error(`Error cleaning up temporary directory: ${cleanupError.message}`);
      }
    }
  }

  async decompileFromPackage(packageName, classpath = []) {
    try {
      const classFilePath = await this.findClassFile(packageName, classpath);
      if (!classFilePath) {
        throw new Error(`Could not find class file for package: ${packageName}`);
      }

      const internalName = packageName.replace(/\./g, '/');
      const classData = await fs.readFile(classFilePath);

      const decompiled = await decompile(internalName, {
        source: async name => {
          if (name === internalName) {
            return classData;
          }
          if (name.startsWith('java/lang/')) {
            return Buffer.from([]);
          }
          return null;
        },
        options: {
          hidelangimports: 'true',
          showversion: 'false',
        },
      });

      return decompiled;
    } catch (error) {
      throw new Error(`Failed to decompile package: ${error.message}`);
    }
  }

  async findClassFile(packageName, classpath = []) {
    const classPathFormat = packageName.replace(/\./g, path.sep) + '.class';

    if (classpath.length === 0) {
      const envClasspath = process.env.CLASSPATH;
      if (envClasspath) {
        classpath = envClasspath.split(path.delimiter);
      } else {
        classpath = [process.cwd()];
      }
    }

    for (const cp of classpath) {
      const potentialPath = path.join(cp, classPathFormat);
      try {
        await fs.access(potentialPath);
        return potentialPath;
      } catch {
        // Continue to next classpath
      }
    }

    return null;
  }

  async listClassesInJar(jarFilePath, includeMembers = true) {
    try {
      await fs.access(jarFilePath);

      const execPromise = promisify(exec);

      // Extract the list of class files in the JAR
      const { stdout } = await execPromise(`jar tf "${jarFilePath}" | grep ".class$"`);
      const classFiles = stdout
        .trim()
        .split('\n')
        .filter(line => line.trim());

      if (classFiles.length === 0) {
        throw new Error('No class files found in the JAR file');
      }

      // Convert internal paths to package.class format and optionally get member info
      const classList = [];

      for (const classFile of classFiles) {
        // Remove .class extension and convert / to .
        const className = classFile.replace('.class', '').replace(/\//g, '.');

        const classInfo = {
          internalPath: classFile,
          className: className,
        };

        // If includeMembers is true, get detailed class information using javap
        if (includeMembers) {
          try {
            // Use javap to get class member information
            const javapCommand = `javap -cp "${jarFilePath}" -p "${className}"`;
            const { stdout: javapOutput } = await execPromise(javapCommand);

            const memberInfo = this.parseJavapOutput(javapOutput);
            classInfo.members = memberInfo;
          } catch (javapError) {
            // If javap fails, still include the class but without member info
            classInfo.members = {
              fields: [],
              methods: [],
              constructors: [],
              error: `Failed to parse members: ${javapError.message}`,
            };
          }
        }

        classList.push(classInfo);
      }

      return {
        jarPath: jarFilePath,
        totalClasses: classList.length,
        includeMembers: includeMembers,
        classes: classList,
      };
    } catch (error) {
      throw new Error(`Failed to list classes in JAR file: ${error.message}`);
    }
  }

  parseJavapOutput(javapOutput) {
    const lines = javapOutput.split('\n');
    const members = {
      fields: [],
      methods: [],
      constructors: [],
      className: '',
      modifiers: [],
      superClass: '',
      interfaces: [],
    };

    let currentSection = 'header';

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('Compiled from')) {
        continue;
      }

      // Parse class declaration
      if (
        trimmedLine.match(/^(public|private|protected|final|abstract|static).*class\s+/) ||
        trimmedLine.match(/^(public|private|protected|final|abstract|static).*interface\s+/)
      ) {
        // Extract class name and modifiers
        const classMatch = trimmedLine.match(/(?:class|interface)\s+([^\s<{]+)/);
        if (classMatch) {
          members.className = classMatch[1];
        }

        // Extract modifiers
        const modifierMatch = trimmedLine.match(
          /^((?:public|private|protected|final|abstract|static|synchronized)\s*)+/
        );
        if (modifierMatch) {
          members.modifiers = modifierMatch[1].trim().split(/\s+/);
        }

        // Extract superclass
        const extendsMatch = trimmedLine.match(/extends\s+([^\s<{]+)/);
        if (extendsMatch) {
          members.superClass = extendsMatch[1];
        }

        // Extract interfaces
        const implementsMatch = trimmedLine.match(/implements\s+([^{]+)/);
        if (implementsMatch) {
          members.interfaces = implementsMatch[1].split(',').map(iface => iface.trim());
        }

        currentSection = 'members';
        continue;
      }

      if (currentSection === 'members' && trimmedLine) {
        // Skip lines that are just braces or other structural elements
        if (trimmedLine === '{' || trimmedLine === '}') {
          continue;
        }

        // Parse fields - look for lines that end with semicolon and don't have parentheses
        if (trimmedLine.endsWith(';') && !trimmedLine.includes('(')) {
          const fieldInfo = this.parseFieldDeclaration(trimmedLine);
          if (fieldInfo) {
            members.fields.push(fieldInfo);
          }
        }
        // Parse methods and constructors - look for lines with parentheses
        else if (trimmedLine.includes('(')) {
          const methodInfo = this.parseMethodDeclaration(trimmedLine);
          if (methodInfo) {
            if (methodInfo.isConstructor) {
              members.constructors.push(methodInfo);
            } else {
              members.methods.push(methodInfo);
            }
          }
        }
      }
    }

    return members;
  }

  parseFieldDeclaration(line) {
    try {
      // Remove trailing semicolon
      const cleanLine = line.replace(';', '').trim();

      // Extract modifiers, type, and name
      const parts = cleanLine.split(/\s+/);
      if (parts.length < 2) return null;

      const modifiers = [];
      let typeIndex = 0;

      // Extract modifiers
      const possibleModifiers = [
        'public',
        'private',
        'protected',
        'static',
        'final',
        'volatile',
        'transient',
      ];
      for (let i = 0; i < parts.length - 2; i++) {
        if (possibleModifiers.includes(parts[i])) {
          modifiers.push(parts[i]);
          typeIndex = i + 1;
        } else {
          break;
        }
      }

      const type = parts[typeIndex];
      const name = parts[typeIndex + 1];

      if (!type || !name) return null;

      return {
        name: name,
        type: type,
        modifiers: modifiers,
      };
    } catch (error) {
      return null;
    }
  }

  parseMethodDeclaration(line) {
    try {
      // Check if this is a constructor (method name matches class name pattern)
      const isConstructor = !line.includes(' ') || line.match(/\b[A-Z][a-zA-Z0-9_]*\s*\(/);

      // Extract method signature
      const methodMatch = line.match(
        /^((?:public|private|protected|static|final|abstract|synchronized|native)\s+)*(?:([^\s(]+)\s+)?([^\s(]+)\s*\(([^)]*)\)/
      );

      if (!methodMatch) return null;

      const modifiersStr = methodMatch[1] || '';
      const returnType = methodMatch[2] || (isConstructor ? 'void' : 'unknown');
      const methodName = methodMatch[3];
      const parametersStr = methodMatch[4] || '';

      // Parse modifiers
      const modifiers = modifiersStr.trim() ? modifiersStr.trim().split(/\s+/) : [];

      // Parse parameters
      const parameters = [];
      if (parametersStr.trim()) {
        const paramParts = parametersStr.split(',');
        for (let i = 0; i < paramParts.length; i++) {
          const paramTrimmed = paramParts[i].trim();
          const paramMatch = paramTrimmed.match(/^(.+)\s+([^\s]+)$/);
          if (paramMatch) {
            // Has both type and name
            parameters.push({
              type: paramMatch[1].trim(),
              name: paramMatch[2].trim(),
            });
          } else {
            // Only has type, generate a default parameter name
            parameters.push({
              type: paramTrimmed,
              name: `arg${i}`, // Generate parameter name like arg0, arg1, arg2
            });
          }
        }
      }

      return {
        name: methodName,
        returnType: returnType,
        parameters: parameters,
        modifiers: modifiers,
        isConstructor: isConstructor,
      };
    } catch (error) {
      return null;
    }
  }

  async getMavenRepositoryPath() {
    try {
      // 1. 检查环境变量
      if (process.env.M2_REPO) {
        return process.env.M2_REPO;
      }
      if (process.env.MAVEN_REPOSITORY) {
        return process.env.MAVEN_REPOSITORY;
      }

      // 2. 尝试从Maven settings.xml文件中读取配置
      const settingsLocations = [
        path.join(os.homedir(), '.m2', 'settings.xml'),
        path.join(process.env.M2_HOME || '/usr/share/maven', 'conf', 'settings.xml'),
        path.join(process.env.MAVEN_HOME || '/usr/share/maven', 'conf', 'settings.xml'),
      ];

      for (const settingsPath of settingsLocations) {
        try {
          const settingsContent = await fs.readFile(settingsPath, 'utf8');
          // 简单的XML解析来提取localRepository标签
          const localRepoMatch = settingsContent.match(
            /<localRepository>\s*([^<]+)\s*<\/localRepository>/
          );
          if (localRepoMatch && localRepoMatch[1]) {
            let repoPath = localRepoMatch[1].trim();
            // 处理相对路径和环境变量
            repoPath = repoPath.replace(/^~/, os.homedir());
            repoPath = repoPath.replace(/\$\{user\.home\}/g, os.homedir());
            return repoPath;
          }
        } catch {
          // 继续尝试下一个配置文件
          continue;
        }
      }

      // 3. 默认路径作为兜底
      return path.join(os.homedir(), '.m2', 'repository');
    } catch (error) {
      // 出错时使用默认路径
      return path.join(os.homedir(), '.m2', 'repository');
    }
  }

  async findJarInMavenRepository(jarName, repositoryPath = null) {
    try {
      // 智能获取Maven仓库路径
      if (!repositoryPath) {
        repositoryPath = await this.getMavenRepositoryPath();
      }

      // 检查仓库路径是否存在
      try {
        await fs.access(repositoryPath);
      } catch {
        throw new Error(`Maven repository path does not exist: ${repositoryPath}`);
      }

      // 处理jarName参数，去掉可能存在的.jar后缀
      let searchName = jarName.trim();
      if (searchName.toLowerCase().endsWith('.jar')) {
        searchName = searchName.slice(0, -4); // 去掉最后的4个字符 '.jar'
      }

      const execPromise = promisify(exec);

      // 使用find命令搜索jar文件，排除source和javadoc jar
      const findCommand = `find "${repositoryPath}" -type f -name "*${searchName}*.jar" | grep -v sources | grep -v javadoc | sort`;

      try {
        const { stdout } = await execPromise(findCommand);
        const jarPaths = stdout
          .trim()
          .split('\n')
          .filter(line => line.trim());

        if (jarPaths.length === 0) {
          return {
            searchTerm: jarName,
            repositoryPath: repositoryPath,
            totalFound: 0,
            jarFiles: [],
          };
        }

        // 为每个找到的jar文件提取更多信息
        const jarFiles = jarPaths.map(jarPath => {
          const fileName = path.basename(jarPath);
          const relativePath = path.relative(repositoryPath, jarPath);
          const pathParts = relativePath.split(path.sep);

          // 尝试提取groupId, artifactId, version信息
          let groupId = '';
          let artifactId = '';
          let version = '';

          if (pathParts.length >= 3) {
            version = pathParts[pathParts.length - 2];
            artifactId = pathParts[pathParts.length - 3];
            groupId = pathParts.slice(0, -2).join('.');
          }

          return {
            fileName: fileName,
            fullPath: jarPath,
            relativePath: relativePath,
            groupId: groupId,
            artifactId: artifactId,
            version: version,
          };
        });

        return {
          searchTerm: jarName,
          repositoryPath: repositoryPath,
          totalFound: jarFiles.length,
          jarFiles: jarFiles,
        };
      } catch (execError) {
        throw new Error(`Failed to search for JAR files: ${execError.message}`);
      }
    } catch (error) {
      throw new Error(`Failed to find JAR in Maven repository: ${error.message}`);
    }
  }

  getInternalNameFromPath(classFilePath) {
    const className = path.basename(classFilePath, '.class');
    const pathParts = classFilePath.split(path.sep);
    const classNameIndex = pathParts.findIndex(part => part === className + '.class');

    if (classNameIndex <= 0) {
      return className;
    }

    const packageParts = [];
    let i = classNameIndex - 1;

    while (i >= 0) {
      const part = pathParts[i];
      if (/^[a-z][a-z0-9_.]*$/.test(part)) {
        packageParts.unshift(part);
      } else {
        break;
      }
      i--;
    }

    if (packageParts.length > 0) {
      return packageParts.join('/') + '/' + className;
    }

    return className;
  }
}

const decompilerService = new DecompilerService();

const server = new Server(
  {
    name: SERVER_NAME,
    version: PACKAGE_VERSION,
    description: 'MCP server for decompiling Java class files',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
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
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name: tool, arguments: args } = request.params;

  switch (tool) {
    case 'decompile-from-path': {
      const { classFilePath } = args;
      if (!classFilePath) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Missing classFilePath parameter',
            },
          ],
        };
      }

      try {
        const decompiled = await decompilerService.decompileFromPath(classFilePath);
        return {
          content: [{ type: 'text', text: decompiled }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
        };
      }
    }

    case 'decompile-from-package': {
      const { packageName, classpath = [] } = args;
      if (!packageName) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Missing packageName parameter',
            },
          ],
        };
      }

      try {
        const decompiled = await decompilerService.decompileFromPackage(packageName, classpath);
        return {
          content: [{ type: 'text', text: decompiled }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
        };
      }
    }

    case 'decompile-from-jar': {
      const { jarFilePath, className } = args;
      if (!jarFilePath) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Missing jarFilePath parameter',
            },
          ],
        };
      }

      if (!className) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Missing className parameter',
            },
          ],
        };
      }

      try {
        const decompiled = await decompilerService.decompileFromJar(jarFilePath, className);
        return {
          content: [{ type: 'text', text: decompiled }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
        };
      }
    }

    case 'analyze-jar-classes': {
      const { jarFilePath, includeMembers = false } = args;
      if (!jarFilePath) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Missing jarFilePath parameter',
            },
          ],
        };
      }

      try {
        const classList = await decompilerService.listClassesInJar(jarFilePath, includeMembers);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(classList, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
        };
      }
    }

    case 'find-jar-in-maven-repository': {
      const { jarName, repositoryPath } = args;
      if (!jarName) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Missing jarName parameter',
            },
          ],
        };
      }

      try {
        const searchResult = await decompilerService.findJarInMavenRepository(
          jarName,
          repositoryPath
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(searchResult, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
        };
      }
    }

    default:
      return {
        content: [{ type: 'text', text: `Error: Unknown tool ${tool}` }],
      };
  }
});

async function main() {
  try {
    console.error(`
---------------------------------------------
MCP Java Decompiler Server v${PACKAGE_VERSION}
---------------------------------------------
Model Context Protocol (MCP) server that
decompiles Java bytecode into readable source
---------------------------------------------
`);

    console.error('Starting in stdio mode...');
    console.error('Use this mode when connecting through an MCP client');

    const transport = new StdioServerTransport();

    await server.connect(transport);

    console.error('MCP Java Decompiler server running on stdio');

    process.on('SIGINT', () => {
      console.error('\nShutting down MCP Java Decompiler server...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.error('\nShutting down MCP Java Decompiler server...');
      process.exit(0);
    });
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
