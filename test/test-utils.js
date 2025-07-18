import * as path from 'path';
import * as fs from 'fs/promises';
import assert from 'assert';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

export const FIXTURES_DIR = path.join(process.cwd(), 'test', 'fixtures');
export const TEST_CLASS_PATH = path.join(FIXTURES_DIR, 'SampleClass.class');
export const TEST_JAR_PATH = path.join(FIXTURES_DIR, 'SampleClass.jar');

export async function createMCPClient() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['index.js'],
  });

  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  });

  await client.connect(transport);
  return { client, transport };
}

export async function ensureTestFixtures() {
  try {
    await fs.access(TEST_CLASS_PATH);
    await fs.access(TEST_JAR_PATH);
  } catch (e) {
    console.log('Test fixtures not found, running create-test-fixtures...');
    const {createFixtures} = await import('./create-test-fixtures.js');
    await createFixtures();
  }
}

export function assertResponseContent(response, expectedIncludes = []) {
  assert(response && response.content, 'Expected content in response');
  const text = response.content[0]?.text || '';

  expectedIncludes.forEach(expected => {
    assert(text.includes(expected), `Expected "${expected}" in response text`);
  });

  return text;
}

export function assertErrorResponse(response, expectedErrorMessage = 'Error:') {
  assert(response && response.content, 'Expected content in error response');
  const text = response.content[0]?.text || '';
  assert(text.includes(expectedErrorMessage), `Expected error message "${expectedErrorMessage}" in response`);
  return text;
}

export function parseJSONResponse(response) {
  assertResponseContent(response);
  const text = response.content[0]?.text || '';
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${text}`);
  }
}
