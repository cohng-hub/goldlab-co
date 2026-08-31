Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\WD\Desktop\작업용\ju\골드랩 작업"
WshShell.Run "node ""c:\Users\WD\Desktop\작업용\ju\골드랩 작업\scripts\sync-and-push.js""", 0, True
Set WshShell = Nothing
