' Runs the Torob sync without opening a console window (used by Windows Task Scheduler).
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
CreateObject("WScript.Shell").Run "node """ & root & "\src\torob-sync.js""", 0, False
