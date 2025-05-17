import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import { minimatch } from 'minimatch';

export class FileNode extends vscode.TreeItem {
  constructor(
    public readonly fsPath: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(path.basename(fsPath), collapsibleState);

    // determina si es carpeta o archivo
    this.contextValue = fsSync.lstatSync(fsPath).isDirectory() ? 'folder' : 'file';

    this.resourceUri = vscode.Uri.file(fsPath);
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    this.description = path.relative(root, fsPath);
  }
}

export class FileTreeProvider implements vscode.TreeDataProvider<FileNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  async getChildren(element?: FileNode): Promise<FileNode[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return [];
    }

    const rootPath = workspaceFolder.uri.fsPath;
    const basePath = element?.fsPath ?? rootPath;
    const ignore = vscode.workspace
      .getConfiguration()
      .get<string[]>('filesExporter.ignore') ?? [];

    const dirents = await fs.readdir(basePath, { withFileTypes: true });

    return dirents
      .filter((dirent) => {
        const fullPath = path.join(basePath, dirent.name);
        const relativePath = path.relative(rootPath, fullPath);
        
        // Verifica si el archivo o carpeta debe ser ignorado
        return !ignore.some((pattern) => {
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
      })
      .map((dirent) => {
        const full = path.join(basePath, dirent.name);
        return new FileNode(
          full,
          dirent.isDirectory()
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        );
      });
  }

  getTreeItem(element: FileNode): vscode.TreeItem {
    return element;
  }
}
