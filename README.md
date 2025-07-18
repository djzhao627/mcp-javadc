# MCP Java Decompiler Server (v0.1.0)

A Model Context Protocol (MCP) server for decompiling Java class files and analyzing JAR archives. This server allows AI assistants and tools that implement the MCP protocol to decompile Java bytecode into readable source code, analyze JAR contents, and work with Maven repositories.

## Features

- **反编译功能**:
  - 从文件路径反编译 Java .class 文件
  - 通过包名反编译 Java 类 (如 java.util.ArrayList)
  - 从 JAR 文件中反编译指定的 Java 类
- **JAR 文件分析**:
  - 分析 JAR 文件中的所有类，包含详细的成员信息（字段、方法、构造函数）
  - 支持可选的详细成员信息获取（性能优化）
- **Maven 仓库集成**:
  - 在 Maven 仓库中搜索 JAR 文件，返回详细信息（路径、GroupID、ArtifactID、版本）
  - 从 Maven 源码 JAR 中查找并返回 Java 源代码
  - 支持基于包名和构件名的精确源码搜索
- **完整的 MCP 协议支持**:
  - Stdio 传输协议，无缝集成
  - 完善的错误处理机制
  - 临时文件自动管理

## Prerequisites

- Node.js 16+ 
- npm
- No Java requirement (using JavaScript port of CFR decompiler)
- Talos https://talos-better.sankuai.com/release?appId=34537

## Installation

### Option 1: Using npx (Recommended)

You can run the server directly with npx without installing:

```bash
# Run the server
npx -y @nibfe/mcp-javadc
```


### Option 2: Global Installation

```bash
# Install globally
npm install -g @nibfe/mcp-javadc

# Run the server
mcpjavadc
```

## Usage

### Quick Start

The easiest way to run the server:

```bash
npm start
```

### Integrating with MCP Clients

To use with an MCP client (like Claude or another MCP-compatible AI assistant):

```bash
# Configure the MCP client to use this server
npx some-mcp-client --server "node /path/to/mcp-javadc/index.js"
```

### Adding to Claude Code

To add this tool to Claude Code:

```bash
claude mcp add javadc -s project -- npx -y @nibfe/mcp-javadc
```

Example MCP client configuration:

```json
{
  "mcpServers": {
    "javaDecompiler": {
      "command": "npx",
      "args": ["-y", "@nibfe/mcp-javadc"],
      "env": {
        "CLASSPATH": "/path/to/java/classes"
      }
    }
  }
}
```

## MCP Tools

The server provides five main tools:

### 1. decompile-from-path

从文件路径反编译 Java .class 文件。

Parameters:
- `classFilePath`: Absolute path to the Java .class file

Example request:
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "mcp.tool.execute",
  "params": {
    "tool": "decompile-from-path",
    "args": {
      "classFilePath": "/path/to/Example.class"
    }
  }
}
```

### 2. decompile-from-package

通过包名反编译 Java 类。

Parameters:
- `packageName`: Fully qualified Java package and class name (e.g., java.util.ArrayList)
- `classpath`: (Optional) Array of classpath directories to search

Example request:
```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "method": "mcp.tool.execute",
  "params": {
    "tool": "decompile-from-package",
    "args": {
      "packageName": "java.util.ArrayList",
      "classpath": ["/path/to/rt.jar", "/path/to/classes"]
    }
  }
}
```

### 3. decompile-from-jar

从 JAR 文件中反编译指定的 Java 类。

Parameters:
- `jarFilePath`: Absolute path to the JAR file (required)
- `className`: Fully qualified class name to extract from the JAR (required) (e.g., "com.example.MyClass")

Example request:
```json
{
  "jsonrpc": "2.0",
  "id": "3",
  "method": "mcp.tool.execute",
  "params": {
    "tool": "decompile-from-jar",
    "args": {
      "jarFilePath": "/path/to/example.jar",
      "className": "com.example.MyClass"
    }
  }
}
```

### 4. analyze-jar-classes

分析 JAR 文件中的所有类，返回包含类名、内部路径和可选成员信息的结构化数据。

Parameters:
- `jarFilePath`: Absolute path to the JAR file (required)
- `includeMembers`: Whether to include detailed member information (fields, methods, constructors) for each class (optional, defaults to false for performance)

Example request:
```json
{
  "jsonrpc": "2.0",
  "id": "4",
  "method": "mcp.tool.execute",
  "params": {
    "tool": "analyze-jar-classes",
    "args": {
      "jarFilePath": "/path/to/example.jar",
      "includeMembers": true
    }
  }
}
```

### 5. find-jar-in-maven-repository

在 Maven 仓库中搜索 JAR 文件，返回详细信息包括路径、GroupID、ArtifactID 和版本。

Parameters:
- `jarName`: The JAR file name to search for (partial matches supported, .jar suffix will be automatically handled) (required)
- `repositoryPath`: Custom path to Maven repository (optional, defaults to ~/.m2/repository)

Example request:
```json
{
  "jsonrpc": "2.0",
  "id": "5",
  "method": "mcp.tool.execute",
  "params": {
    "tool": "find-jar-in-maven-repository",
    "args": {
      "jarName": "spring-web"
    }
  }
}
```

### 6. find-source-by-package

从 Maven 仓库的源码 JAR 文件中查找并返回 Java 源代码。

Parameters:
- `packageName`: Fully qualified Java package and class name (e.g., "com.example.MyClass") (required)
- `artifactName`: Maven artifact name for precise targeting (e.g., "spring-web", "guava") (optional)
- `repositoryPath`: Custom path to Maven repository (optional, defaults to ~/.m2/repository)
- `includeContent`: Whether to include the full source file content in the response (optional, defaults to true)

Example request:
```json
{
  "jsonrpc": "2.0",
  "id": "6",
  "method": "mcp.tool.execute",
  "params": {
    "tool": "find-source-by-package",
    "args": {
      "packageName": "org.springframework.http.HttpMethod",
      "artifactName": "spring-web"
    }
  }
}
```

## Known Issues

### Java Class Decompilation

The CFR decompiler (@run-slicer/cfr) is a JavaScript port of the popular CFR Java decompiler. It works well with:

1. Standard Java class files
2. Classes that are part of a known package structure
3. Modern Java features (all Java versions)
4. JAR files containing Java classes

If you encounter issues with a specific class file, try:
- Using the `decompile-from-package` tool with explicit classpath
- Using the `decompile-from-jar` tool with explicit class name
- Ensuring the class file is a valid Java bytecode file
- Checking for corrupt class files or JAR archives

### Maven Repository Usage

When working with JAR files from Maven repositories:
- Use the `find ~/.m2 -name "*dependency-name*jar"` command to locate JAR files
- Filter out source and javadoc JARs using `grep -v source | grep -v javadoc`
- Use `jar tf your-jar-file.jar | grep .class` to list available classes in a JAR
- Check that class names match the package structure in the JAR

### Member Information Analysis

When using `analyze-jar-classes` with `includeMembers: true`:
- The tool uses `javap` command which must be available in your system PATH
- Large JAR files may take considerable time to analyze with member information
- Set `includeMembers: false` for performance-focused analysis
- Some obfuscated classes may not provide complete member information

### Source Code Search

When using `find-source-by-package`:
- Initial searches may return no sources but show `availableSourceJars`
- Use the two-step approach: first search broadly, then with specific `artifactName`
- Source JARs must be present in the Maven repository (often downloaded separately)
- Not all Maven artifacts include source JAR files


## Configuration

### Environment Variables

- `CLASSPATH`: Java classpath for finding class files (used when no classpath is specified)

## Development

```bash
# Run in development mode
npm run dev

# Create test fixtures (creates sample Java class for testing)
npm run test:setup

# Run tests 
npm test

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Run with MCP Inspector for interactive testing
npx @modelcontextprotocol/inspector node ./index.js
```

## Testing with MCP Inspector

You can use the official MCP Inspector tool to test the server functionality interactively:

```bash
# Install and run the MCP Inspector with the decompiler server
npx @modelcontextprotocol/inspector node ./index.js
```

The Inspector provides a user-friendly web interface that allows you to:
- List all available tools
- Execute the decompilation tools with custom parameters
- View and explore the decompiled output
- Test different inputs and error scenarios

This is especially useful for debugging and understanding the MCP server's capabilities before integrating it with other applications.

## How It Works

1. The server uses the CFR decompiler (@run-slicer/cfr - a JavaScript port of the popular CFR Java decompiler)
2. When a decompile request is received, the server:
   - Reads the class file data directly or extracts it from a JAR file
   - Processes the class file with CFR decompiler
   - Returns the formatted source code
3. For JAR files, the server:
   - Creates a temporary directory for extraction
   - Extracts the JAR contents
   - Decompiles the specified class (or first class if none specified)
   - Cleans up the temporary directory

## License

ISC
