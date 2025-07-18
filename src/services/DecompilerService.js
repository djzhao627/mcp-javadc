import * as path from 'path';
import * as fs from 'fs/promises';
import { decompile } from '@run-slicer/cfr';
import * as os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';

export class DecompilerService {
  // ===== 反编译相关方法 =====
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

      const decompiled = await this.performDecompilation(internalName, classData);

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

      const decompiled = await this.performDecompilation(internalName, classData);

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

  // ===== JAR文件分析方法 =====
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

  // ===== 工具方法 =====
  getInternalNameFromPath(classFilePath) {
    const className = path.basename(classFilePath, '.class');
    const pathParts = classFilePath.split(path.sep);
    const classNameIndex = pathParts.findIndex(part => part === className + '.class');

    if (classNameIndex <= 0) {
      return className;
    }

    const packageParts = [];
    for (let i = classNameIndex - 1; i >= 0; i--) {
      const part = pathParts[i];
      if (/^[a-z][a-z0-9_.]*$/.test(part)) {
        packageParts.unshift(part);
      } else {
        break;
      }
    }

    return packageParts.length > 0 ? packageParts.join('/') + '/' + className : className;
  }

  /**
   * 根据包名在Maven仓库中查找Java源码文件
   * @param {string} packageName - 完全限定的Java包名和类名
   * @param {string} artifactName - Maven artifact名称（可选）
   * @param {string} repositoryPath - Maven仓库路径
   * @param {boolean} includeContent - 是否包含文件内容
   * @returns {Object} 包含源码信息的对象
   */
  // ===== Maven源码查找方法 =====
  async findSourceByPackage(
    packageName,
    artifactName = null,
    repositoryPath = null,
    includeContent = true
  ) {
    try {
      // 获取Maven仓库路径
      if (!repositoryPath) {
        repositoryPath = await this.getMavenRepositoryPath();
      }

      // 检查仓库路径是否存在
      try {
        await fs.access(repositoryPath);
      } catch {
        throw new Error(`Maven repository path does not exist: ${repositoryPath}`);
      }

      const javaFilePath = packageName.replace(/\./g, '/') + '.java';

      const results = {
        packageName: packageName,
        repositoryPath: repositoryPath,
        sourceJars: [],
        foundSources: [],
        totalFound: 0,
      };

      // 搜索包含该包名的sources JAR文件

      const execPromise = promisify(exec);

      // 搜索sources JAR文件
      let findCommand;
      if (artifactName) {
        findCommand = `find "${repositoryPath}" -type f -name "*${artifactName}*sources.jar" | head -20`;
      } else {
        // 使用包名的一部分进行搜索
        const searchTerm = packageName.split('.').slice(-2).join('');
        findCommand = `find "${repositoryPath}" -type f -name "*sources.jar" | grep -i "${searchTerm}" | head -10`;
      }

      try {
        const { stdout } = await execPromise(findCommand);
        const sourceJarPaths = stdout
          .trim()
          .split('\n')
          .filter(line => line.trim());

        if (sourceJarPaths.length === 0) {
          // 如果没有找到特定的sources JAR，尝试更广泛的搜索
          const broadSearchCommand = `find "${repositoryPath}" -type f -name "*sources.jar" | head -50`;
          try {
            const { stdout: broadStdout } = await execPromise(broadSearchCommand);
            const allSourceJars = broadStdout
              .trim()
              .split('\n')
              .filter(line => line.trim());

            results.availableSourceJars = allSourceJars.slice(0, 10).map(jarPath => ({
              jarPath: jarPath,
              relativePath: path.relative(repositoryPath, jarPath),
            }));
          } catch (broadError) {
            // 忽略错误
          }

          return {
            ...results,
            message: `No sources JAR files found for package: ${packageName}`,
          };
        }

        // 在每个找到的sources JAR中搜索指定的源码文件
        for (const jarPath of sourceJarPaths) {
          try {
            const sourceInfo = await this.extractSourceFromJar(
              jarPath,
              javaFilePath,
              includeContent
            );
            if (sourceInfo) {
              results.foundSources.push({
                jarPath: jarPath,
                relativePath: path.relative(repositoryPath, jarPath),
                ...sourceInfo,
              });
            }

            // 记录搜索过的JAR文件
            results.sourceJars.push({
              jarPath: jarPath,
              relativePath: path.relative(repositoryPath, jarPath),
              searched: true,
              found: !!sourceInfo,
            });
          } catch (jarError) {
            results.sourceJars.push({
              jarPath: jarPath,
              relativePath: path.relative(repositoryPath, jarPath),
              searched: true,
              found: false,
              error: jarError.message,
            });
          }
        }

        results.totalFound = results.foundSources.length;

        return results;
      } catch (execError) {
        throw new Error(`Failed to search for sources JAR files: ${execError.message}`);
      }
    } catch (error) {
      throw new Error(`Failed to find source by package: ${error.message}`);
    }
  }

  // ===== 私有辅助方法 =====
  /**
   * 执行反编译操作
   * @param {string} internalName - 内部类名
   * @param {Buffer} classData - 类字节码数据
   * @returns {string} 反编译的源码
   */
  async performDecompilation(internalName, classData) {
    return await decompile(internalName, {
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
  }

  /**
   * 从sources JAR文件中提取指定的源码文件
   * @param {string} jarPath - sources JAR文件路径
   * @param {string} javaFilePath - Java文件在JAR中的路径
   * @param {boolean} includeContent - 是否包含文件内容
   * @returns {Object|null} 源码信息对象，如果找不到则返回null
   */
  async extractSourceFromJar(jarPath, javaFilePath, includeContent = true) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'source-extract-'));
    const execPromise = promisify(exec);

    try {
      // 首先检查JAR中是否包含指定的源码文件
      const { stdout: listStdout } = await execPromise(
        `jar tf "${jarPath}" | grep -F "${javaFilePath}"`
      );

      if (!listStdout.trim()) {
        return null; // 文件不存在于JAR中
      }

      // 提取JAR文件到临时目录
      await execPromise(`cd "${tempDir}" && jar xf "${jarPath}"`);

      const extractedFilePath = path.join(tempDir, javaFilePath);

      try {
        // 检查提取的文件是否存在
        await fs.access(extractedFilePath);

        // 获取文件统计信息
        const stats = await fs.stat(extractedFilePath);

        const sourceInfo = {
          sourceFilePath: javaFilePath,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
          exists: true,
        };

        // 如果需要包含内容，则读取文件
        if (includeContent) {
          try {
            const content = await fs.readFile(extractedFilePath, 'utf-8');
            sourceInfo.content = content;
            sourceInfo.lines = content.split('\n').length;

            // 提取一些基本信息
            sourceInfo.packageDeclaration = this.extractPackageDeclaration(content);
            sourceInfo.imports = this.extractImports(content);
            sourceInfo.classDeclaration = this.extractClassDeclaration(content);
          } catch (readError) {
            sourceInfo.contentError = `Failed to read source content: ${readError.message}`;
          }
        }

        return sourceInfo;
      } catch (accessError) {
        return null; // 文件不存在
      }
    } catch (error) {
      throw new Error(`Failed to extract source from JAR: ${error.message}`);
    } finally {
      // 清理临时目录
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error(`Error cleaning up temporary directory: ${cleanupError.message}`);
      }
    }
  }

  /**
   * 从源码内容中提取包声明
   * @param {string} content - 源码内容
   * @returns {string|null} 包名
   */
  extractPackageDeclaration(content) {
    const packageMatch = content.match(/^\s*package\s+([^;]+);/m);
    return packageMatch ? packageMatch[1].trim() : null;
  }

  /**
   * 从源码内容中提取import语句
   * @param {string} content - 源码内容
   * @returns {string[]} import语句数组
   */
  extractImports(content) {
    const imports = [];
    const importRegex = /^\s*import\s+(static\s+)?([^;]+);/gm;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[2].trim());
    }

    return imports;
  }

  /**
   * 从源码内容中提取类声明信息
   * @param {string} content - 源码内容
   * @returns {Object|null} 类声明信息
   */
  extractClassDeclaration(content) {
    // 匹配类、接口、枚举声明
    const classMatch = content.match(
      /^\s*((?:(?:public|private|protected|abstract|final|static)\s+)*)\s*(class|interface|enum)\s+(\w+)/m
    );

    if (classMatch) {
      const modifiersStr = classMatch[1].trim();
      const modifiers = modifiersStr ? modifiersStr.split(/\s+/).filter(m => m) : [];

      return {
        modifiers: modifiers,
        type: classMatch[2],
        name: classMatch[3],
      };
    }

    return null;
  }
}
