import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';

/**
 * Copia el contenido de un archivo individual al portapapeles
 */
export async function copySingleFile(filePath: string) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    await vscode.env.clipboard.writeText(content);
    vscode.window.showInformationMessage(`Archivo copiado al portapapeles ✔️: ${path.basename(filePath)}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Error al copiar el archivo: ${error}`);
  }
}

export async function copyWholeProject() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage('No hay carpeta de proyecto abierta.');
    return;
  }

  const root = workspaceFolder.uri.fsPath;
  const ignore = vscode.workspace
    .getConfiguration()
    .get<string[]>('filesExporter.ignore') ?? [];

  const lines: string[] = [];
  let filesCount = 0;

  await walk(root);

  if (filesCount === 0) {
    vscode.window.showWarningMessage('No se encontraron archivos para copiar. Verifica tus patrones de ignorar.');
    return;
  }

  await vscode.env.clipboard.writeText(lines.join('\n'));
  vscode.window.showInformationMessage(`Proyecto copiado al portapapeles ✔️ (${filesCount} archivos)`);

  async function walk(dir: string) {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    for (const dirent of dirents) {
      const full = path.join(dir, dirent.name);
      const relativePath = path.relative(root, full);
      
      // Verifica si el archivo o carpeta debe ser ignorado
      const shouldIgnore = ignore.some((pattern) => {
        // Para patrones que comienzan con **/, aplica minimatch
        if (pattern.startsWith('**/')) {
          return minimatch(relativePath, pattern);
        }
        // Para patrones que especifican nombres exactos, compara solo el nombre
        else if (!pattern.includes('/')) {
          return dirent.name === pattern;
        }
        // Para patrones que son rutas relativas
        else {
          return minimatch(relativePath, pattern);
        }
      });

      if (shouldIgnore) {
        console.log(`Ignorando: ${relativePath}`);
        continue;
      }

      if (dirent.isDirectory()) {
        await walk(full);
      } else {
        try {
          const content = await fs.readFile(full, 'utf-8');
          lines.push(
            `${full}\n${'-'.repeat(full.length)}\n${content}\n`
          );
          filesCount++;
        } catch (error) {
          console.error(`Error al leer archivo ${full}:`, error);
        }
      }
    }
  }
}
