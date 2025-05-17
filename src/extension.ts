// ──────────────────────────────────────────────
// src/extension.ts
// ──────────────────────────────────────────────
import * as vscode from 'vscode';
import * as path from 'path';
import { FileTreeProvider, FileNode } from './fileTree';
import { copyWholeProject, copySingleFile } from './copier';

export function activate(context: vscode.ExtensionContext) {
  console.log('Activando extensión My Files Exporter...');
  
  try {
    const treeProvider = new FileTreeProvider();
    console.log('Proveedor de árbol de archivos creado correctamente');

    // ① Registrar la vista y guardar el Disposable en las suscripciones
    const treeView = vscode.window.registerTreeDataProvider('filesExporterView', treeProvider);
    console.log('Vista de árbol registrada:', treeView ? 'OK' : 'Error');
    context.subscriptions.push(treeView);

    // ② Comando: refrescar árbol
    const refreshCmd = vscode.commands.registerCommand('filesExporter.refresh', () => {
      console.log('Comando refresh ejecutado');
      treeProvider.refresh();
    });
    console.log('Comando refresh registrado');
    context.subscriptions.push(refreshCmd);

    // ③ Comando: copiar proyecto completo
    const copyCmd = vscode.commands.registerCommand('filesExporter.copyProject', copyWholeProject);
    console.log('Comando copyProject registrado');
    context.subscriptions.push(copyCmd);
    
    // ④ Comando: ignorar archivo/carpeta
    const ignoreCmd = vscode.commands.registerCommand('filesExporter.ignoreFile', async (node: FileNode) => {
      console.log('Comando ignoreFile ejecutado para:', node.fsPath);
      
      if (!node) {
        vscode.window.showErrorMessage('No se ha seleccionado ningún archivo o carpeta.');
        return;
      }
      
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return;
      }
      
      const rootPath = workspaceFolder.uri.fsPath;
      const relativePath = path.relative(rootPath, node.fsPath);
      
      // Preguntar qué tipo de patrón quiere usar
      const patternType = await vscode.window.showQuickPick([
        { label: 'Exacto', description: `Ignorar solo "${relativePath}"` },
        { label: 'Por nombre', description: `Ignorar todos los archivos llamados "${path.basename(node.fsPath)}"` },
        { label: 'Por extensión', description: node.contextValue === 'file' ? `Ignorar todos los archivos con extensión "${path.extname(node.fsPath)}"` : 'No aplicable a carpetas' }
      ], {
        placeHolder: 'Selecciona el tipo de patrón para ignorar',
        canPickMany: false
      });
      
      if (!patternType) {
        return; // El usuario canceló
      }
      
      let pattern = '';
      
      switch (patternType.label) {
        case 'Exacto':
          pattern = relativePath;
          break;
        case 'Por nombre':
          pattern = `**/${path.basename(node.fsPath)}`;
          break;
        case 'Por extensión':
          if (node.contextValue === 'file' && path.extname(node.fsPath)) {
            pattern = `**/*${path.extname(node.fsPath)}`;
          } else {
            vscode.window.showInformationMessage('No se puede ignorar por extensión una carpeta o un archivo sin extensión.');
            return;
          }
          break;
      }
      
      if (!pattern) {
        return;
      }
      
      // Obtener la configuración actual
      const config = vscode.workspace.getConfiguration();
      const currentIgnorePatterns: string[] = config.get('filesExporter.ignore') || [];
      
      // Verificar si ya existe
      if (currentIgnorePatterns.includes(pattern)) {
        vscode.window.showInformationMessage(`El patrón "${pattern}" ya está en la lista de ignorados.`);
        return;
      }
      
      // Actualizar la configuración
      const newIgnorePatterns = [...currentIgnorePatterns, pattern];
      await config.update('filesExporter.ignore', newIgnorePatterns, vscode.ConfigurationTarget.Workspace);
      
      vscode.window.showInformationMessage(`Añadido "${pattern}" a la lista de archivos ignorados.`);
      
      // Refrescar la vista
      treeProvider.refresh();
    });
    console.log('Comando ignoreFile registrado');
    context.subscriptions.push(ignoreCmd);
    
    // ⑤ Comando: copiar archivo seleccionado
    const copyFileCmd = vscode.commands.registerCommand('filesExporter.copyFile', async (node: FileNode) => {
      console.log('Comando copyFile ejecutado para:', node.fsPath);
      
      if (!node) {
        vscode.window.showErrorMessage('No se ha seleccionado ningún archivo.');
        return;
      }
      
      if (node.contextValue !== 'file') {
        vscode.window.showInformationMessage('Esta acción solo está disponible para archivos.');
        return;
      }
      
      await copySingleFile(node.fsPath);
    });
    console.log('Comando copyFile registrado');
    context.subscriptions.push(copyFileCmd);
    
    // ⑥ Comando: gestionar archivos ignorados
    const manageIgnoredCmd = vscode.commands.registerCommand('filesExporter.manageIgnored', async () => {
      console.log('Comando manageIgnored ejecutado');
      
      // Obtener la configuración actual
      const config = vscode.workspace.getConfiguration();
      const currentIgnorePatterns: string[] = config.get('filesExporter.ignore') || [];
      
      if (currentIgnorePatterns.length === 0) {
        vscode.window.showInformationMessage('No hay patrones en la lista de ignorados.');
        return;
      }
      
      // Crear los items para mostrar al usuario
      const items = currentIgnorePatterns.map(pattern => ({
        label: pattern,
        picked: false
      }));
      
      // Mostrar quickpick con opción de selección múltiple
      const selectedPatterns = await vscode.window.showQuickPick(items, {
        placeHolder: 'Selecciona los patrones que deseas eliminar de la lista de ignorados',
        canPickMany: true
      });
      
      if (!selectedPatterns || selectedPatterns.length === 0) {
        return; // El usuario canceló o no seleccionó nada
      }
      
      // Crear una nueva lista sin los patrones seleccionados
      const patternsToRemove = selectedPatterns.map(item => item.label);
      const newIgnorePatterns = currentIgnorePatterns.filter(pattern => !patternsToRemove.includes(pattern));
      
      // Actualizar la configuración
      await config.update('filesExporter.ignore', newIgnorePatterns, vscode.ConfigurationTarget.Workspace);
      
      vscode.window.showInformationMessage(
        `Se ${patternsToRemove.length === 1 ? 'ha eliminado 1 patrón' : `han eliminado ${patternsToRemove.length} patrones`} de la lista de ignorados.`
      );
      
      // Refrescar la vista
      treeProvider.refresh();
    });
    console.log('Comando manageIgnored registrado');
    context.subscriptions.push(manageIgnoredCmd);
    
    console.log('Extensión My Files Exporter activada correctamente');
  } catch (error) {
    console.error('Error al activar la extensión:', error);
    vscode.window.showErrorMessage(`Error al iniciar la extensión: ${error}`);
  }
}

export function deactivate() {
  console.log('Desactivando extensión My Files Exporter...');
}
