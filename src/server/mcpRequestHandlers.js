export function createRequestHandlers(decompilerService) {
  return {
    'decompile-from-path': async args => {
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
    },

    'decompile-from-package': async args => {
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
    },

    'decompile-from-jar': async args => {
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
    },

    'analyze-jar-classes': async args => {
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
    },

    'find-jar-in-maven-repository': async args => {
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
    },

    'find-source-by-package': async args => {
      const { packageName, artifactName, repositoryPath, includeContent = true } = args;

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
        const sourceResult = await decompilerService.findSourceByPackage(
          packageName,
          artifactName,
          repositoryPath,
          includeContent
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(sourceResult, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
        };
      }
    },
  };
}
