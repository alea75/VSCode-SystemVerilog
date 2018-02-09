import {DocumentSymbolProvider, SymbolInformation, CancellationToken, TextDocument, Location, Position, SymbolKind, Range, TreeDataProvider, TreeItem,
        Event, EventEmitter, TreeItemCollapsibleState, window} from 'vscode'

// See test/SymbolKind_icons.png for an overview of the icons
export function getSymbolKind(name: String): SymbolKind {
    switch (name) {
        case 'parameter':
        case 'localparam': return SymbolKind.Constant;
        case 'package':
        case 'import': return SymbolKind.Package;
        case 'wire':
        case 'reg':
        case 'logic': return SymbolKind.Boolean;
        case 'string': return SymbolKind.String;
        case 'class': return SymbolKind.Class;
        case 'task': return SymbolKind.Method;
        case 'function': return SymbolKind.Function;
        case 'interface': return SymbolKind.Interface;
        case 'event': return SymbolKind.Event;
        case 'struct': return SymbolKind.Struct;
        case 'program':  return SymbolKind.Module;
        case 'module':
        default: return SymbolKind.Variable;
    }
    /* Not used! / Free SymbolKind icons
        return SymbolKind.Number;
        return SymbolKind.Enum;
        return SymbolKind.EnumMember;
        return SymbolKind.Operator;
        return SymbolKind.TypeParameter;
        return SymbolKind.Property;
        return SymbolKind.Array; 
    */
}

export class SystemVerilogDocumentSymbolProvider implements DocumentSymbolProvider {

    // XXX: Does not match virtual interface instantiantion, eg virtual intf u_virtInterface;
    // XXX: Does not match input/output/inout ports, eg input logic din, ..
    // TODO: Match labels with SymbolKind.Enum
    public regex: RegExp = new RegExp('^\\s*(?!begin|end|else|join|fork)(\\w+|(?:virtual|static|automatic)\\s+\\w+)(?:\\s+|\\s*#\\s*\\([\\s\\S]*?\\)\\s*)(?:\\[.*?\\]\\s*)?(\\w+(?:\\s*,\\s*\\w+)*?)\\s*(?:\\([\\s\\S]*?\\)|extends\\s*\\w+)?\\s*;','mg');

    public provideDocumentSymbols(document: TextDocument, token?: CancellationToken): Thenable<SymbolInformation[]> {
        return new Promise((resolve, reject) => {
            /* 
                First loop finds every instantiation of 
                variables/modules/objects in the file
            */
            var symbols = [];
            let text = document.getText()
            var match;
            do {
                match = this.regex.exec(text);
                if (match) {
                    let words = match[2].match(/\b(\w+)\b/g)
                    words.forEach( object => {
                        symbols.push(new SymbolInformation(
                            object,
                            getSymbolKind(match[1]),
                            match[1],
                            new Location(document.uri, new Range(0,0,0,0))
                        ));
                    });
                }
            } while (match != null);

            /*
                Second loop finds the position of every symbol
                and sets name based on containerName and TODO setup containerName correctly
            */
            // TODO: Inside comment block (track current scope)
            // TODO: May match wrongly if the same name is used before declaration
            var scope: string[] = [""];
            var scopeType: string[] = [""];
            // var commentBlock: Boolean = false;
            var line_no: number = 0;
            symbols.forEach( function(symbol) {
                let word = symbol.name;
                let regex: RegExp = new RegExp('(?:[^\\.])\\b(word)\\b'.replace('word', word))
                while (line_no < document.lineCount) {
                    let line = document.lineAt(line_no).text;
                    let commentStart = line.indexOf('//');
                    if (commentStart != -1) {
                        line = line.substr(0, commentStart);
                    }
                    let match = regex.exec(line);
                    if (match) {
                        let type = symbol.containerName;
                        let name = symbol.name;
                        symbol.location.range = new Range(line_no, match.index, line_no, match.index+word.length);
                        symbol.containerName = scope[scope.length-1];
                        if ( "module|program|class|function|task|interface|config".match("\\b"+type+"\\b")){
                            scope.push(name);
                            scopeType.push(type);
                        }
                        break;
                    }
                    if (line.indexOf("end" + scopeType[scopeType.length-1]) != -1){
                        scope.pop();
                        scopeType.pop();
                    }
                    line_no++;
                }
            })
            resolve(symbols);
        });
    }
}

export class SystemVerilogDocumentSymbolTreeProvider implements TreeDataProvider<TreeItem> {
    // TODO: Not updating when active file changes
    private _onDidChangeTreeData: EventEmitter<any> = new EventEmitter<any>();
    readonly onDidChangeTreeData: Event<any> = this._onDidChangeTreeData.event;

    private provider: SystemVerilogDocumentSymbolProvider = new SystemVerilogDocumentSymbolProvider();

    public getTreeItem(element: TreeItem): Promise<TreeItem> {
        return new Promise((resolve, reject) => {
            resolve(element);
        });
    }
    
    public getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        return new Promise((resolve, reject) => {
            let items = [];
            if (!element) {
                this.provider.provideDocumentSymbols(window.activeTextEditor.document).then( symbols => {
                    symbols.forEach(symbol => {
                        if (symbol.containerName == "") {
                            let item = new TreeItem(symbol.name)
                            item.resourceUri = window.activeTextEditor.document.uri;
                            if(symbols.map( a => a.containerName).indexOf(symbol.name) != 0) {
                                item.collapsibleState = TreeItemCollapsibleState.Collapsed
                            }
                            items.push(item);
                        }
                    });
                })
            } else {
                this.provider.provideDocumentSymbols(window.activeTextEditor.document).then( symbols => {
                    symbols.forEach( symbol => {
                        if (element.label == symbol.containerName){
                            let item = new TreeItem(symbol.name)
                            item.resourceUri = window.activeTextEditor.document.uri;
                            item.id = symbol.location.uri.toString();
                            item.id += ",line:"+ symbol.location.range.start.line.toString();
                            item.id += ",char:"+ symbol.location.range.start.line.toString();
                            if(symbols.map( a => a.containerName).indexOf(symbol.name) != -1) {
                                item.collapsibleState = TreeItemCollapsibleState.Collapsed
                            }
                            items.push(item);
                        }
                    });
                });
            }
            resolve(items)
        });
    }
}
