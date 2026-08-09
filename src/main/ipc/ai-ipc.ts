import {
  clipboard,
  dialog,
  ipcMain,
  shell,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from 'electron';
import { z } from 'zod';

import {
  AI_IPC_CHANNELS,
  type AiCapabilities,
  type AiChatGptBridgeResult,
  type AiConversation,
  type AiCredentialState,
  type AiTaskInput,
  type AiTaskAccepted,
} from '../../shared/contracts/ai';
import type { ApiResult } from '../../shared/contracts/library';
import type { AiAssistantService } from '../ai/ai-assistant-service';
import { isOfficialOpenAiBaseUrl, normalizeAiBaseUrl } from '../ai/base-url-policy';
import { buildChatGptBridgePrompt, CHATGPT_BRIDGE_URL } from '../ai/prompts';
import { LibraryError } from '../library/errors';
import {
  aiApiKeySchema,
  aiChatGptBridgeInputSchema,
  aiChatGptBridgeResultSchema,
  aiCapabilitiesSchema,
  aiConversationSchema,
  aiCredentialStateSchema,
  aiProviderSettingsSchema,
  aiRequestIdSchema,
  aiTaskAcceptedSchema,
  aiTaskInputSchema,
} from './ai-schemas';
import { invokeValidated } from './library-ipc';
import { paperIdSchema } from './library-schemas';

export function registerAiIpcHandlers(
  assistant: AiAssistantService,
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(AI_IPC_CHANNELS.getCapabilities, (event): Promise<ApiResult<AiCapabilities>> =>
    invokeValidated(event, aiCapabilitiesSchema, () => assistant.getCapabilities()),
  );

  ipcMain.handle(
    AI_IPC_CHANNELS.updateSettings,
    (event, input: unknown): Promise<ApiResult<AiCapabilities>> =>
      invokeValidated(event, aiCapabilitiesSchema, async () => {
        ensureMainWindowSender(event, getMainWindow);
        const settings = aiProviderSettingsSchema.parse(input);
        const normalizedBaseUrl = normalizeAiBaseUrl(settings.baseUrl);
        const current = await assistant.getCapabilities();
        if (
          !isOfficialOpenAiBaseUrl(normalizedBaseUrl) &&
          normalizedBaseUrl !== current.settings.baseUrl
        ) {
          const owner = getMainWindow();
          const hostname = new URL(normalizedBaseUrl).hostname;
          const options = {
            type: 'warning' as const,
            title: 'Use a custom AI endpoint?',
            message: `OpenAI credentials and selected text will be sent to ${hostname}.`,
            detail:
              'Only continue if you trust this HTTPS endpoint. PaperMind blocks local-network addresses and redirects.',
            buttons: ['Cancel', 'Use endpoint'],
            defaultId: 0,
            cancelId: 0,
            noLink: true,
          };
          const decision = owner
            ? await dialog.showMessageBox(owner, options)
            : await dialog.showMessageBox(options);
          if (decision.response !== 1) {
            throw new LibraryError('PERMISSION_DENIED', 'The custom AI endpoint was not saved.');
          }
        }
        return assistant.updateSettings({ ...settings, baseUrl: normalizedBaseUrl });
      }),
  );

  ipcMain.handle(
    AI_IPC_CHANNELS.setApiKey,
    (event, input: unknown): Promise<ApiResult<AiCredentialState>> =>
      invokeValidated(event, aiCredentialStateSchema, () => {
        ensureMainWindowSender(event, getMainWindow);
        return assistant.setApiKey(aiApiKeySchema.parse(input));
      }),
  );

  ipcMain.handle(AI_IPC_CHANNELS.deleteApiKey, (event): Promise<ApiResult<AiCredentialState>> =>
    invokeValidated(event, aiCredentialStateSchema, () => {
      ensureMainWindowSender(event, getMainWindow);
      return assistant.deleteApiKey();
    }),
  );

  ipcMain.handle(
    AI_IPC_CHANNELS.getConversation,
    (event, input: unknown): Promise<ApiResult<AiConversation | null>> =>
      invokeValidated(event, aiConversationSchema.nullable(), () => {
        ensureMainWindowSender(event, getMainWindow);
        return assistant.getConversation(paperIdSchema.parse(input));
      }),
  );

  ipcMain.handle(
    AI_IPC_CHANNELS.openChatGptBridge,
    (event, input: unknown): Promise<ApiResult<AiChatGptBridgeResult>> =>
      invokeValidated(event, aiChatGptBridgeResultSchema, async () => {
        ensureMainWindowSender(event, getMainWindow);
        const task = aiChatGptBridgeInputSchema.parse(input);
        const prompt = buildChatGptBridgePrompt(task);
        clipboard.writeText(prompt);
        let opened = true;
        try {
          await shell.openExternal(CHATGPT_BRIDGE_URL);
        } catch {
          opened = false;
        }
        return {
          copied: true,
          destinationUrl: CHATGPT_BRIDGE_URL,
          opened,
          promptCharacterCount: prompt.length,
        };
      }),
  );

  ipcMain.handle(
    AI_IPC_CHANNELS.startTask,
    (event, input: unknown): Promise<ApiResult<AiTaskAccepted>> =>
      invokeValidated(event, aiTaskAcceptedSchema, () => {
        ensureMainWindowSender(event, getMainWindow);
        const sender = event.sender;
        const task = aiTaskInputSchema.parse(input);
        return confirmAndStartTask(assistant, task, getMainWindow, sender.id, (streamEvent) => {
          if (!sender.isDestroyed()) sender.send(AI_IPC_CHANNELS.streamEvent, streamEvent);
        });
      }),
  );

  ipcMain.handle(
    AI_IPC_CHANNELS.cancelTask,
    (event, input: unknown): Promise<ApiResult<{ readonly requestId: string }>> =>
      invokeValidated(event, z.object({ requestId: aiRequestIdSchema }).strict(), () => {
        ensureMainWindowSender(event, getMainWindow);
        const requestId = aiRequestIdSchema.parse(input);
        assistant.cancelTask(requestId, event.sender.id);
        return Promise.resolve({ requestId });
      }),
  );
}

async function confirmAndStartTask(
  assistant: AiAssistantService,
  task: AiTaskInput,
  getMainWindow: () => BrowserWindow | null,
  ownerId: number,
  emit: Parameters<AiAssistantService['startTask']>[2],
): Promise<AiTaskAccepted> {
  const capabilities = await assistant.getCapabilities();
  const hostname = new URL(capabilities.settings.baseUrl).hostname;
  const scope = task.selection
    ? [
        `Selected PDF text: page ${String(task.selection.pageNumber)}, offsets ${String(task.selection.textStart)}-${String(task.selection.textEnd)}, ${String(task.selection.selectedText.length)} characters.`,
        '',
        task.selection.selectedText,
      ].join('\n')
    : 'No PDF text is attached.';
  const question = task.prompt
    ? `\n\nQuestion (${String(task.prompt.length)} characters):\n${task.prompt}`
    : '';
  const history = task.conversationId
    ? '\n\nUp to 20 completed prior messages (maximum 40,000 characters) will also be sent.'
    : '\n\nNo prior conversation messages will be sent.';
  const options = {
    type: 'question' as const,
    title: 'Confirm AI request',
    message: `Send this request to ${hostname}?`,
    detail: `${scope}${question}${history}\n\nThe PDF file, file path, annotations, notes, and other papers stay local.`,
    buttons: ['Cancel', 'Send request'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
  const owner = getMainWindow();
  const decision = owner
    ? await dialog.showMessageBox(owner, options)
    : await dialog.showMessageBox(options);
  if (decision.response !== 1) {
    throw new LibraryError('PERMISSION_DENIED', 'The AI request was cancelled before sending.');
  }
  return assistant.startTask(task, ownerId, emit);
}

function ensureMainWindowSender(
  event: IpcMainInvokeEvent,
  getMainWindow: () => BrowserWindow | null,
): void {
  if (event.sender !== getMainWindow()?.webContents) {
    throw new LibraryError('PERMISSION_DENIED', 'AI settings are limited to the main window.');
  }
}
