Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

strAppDir = FSO.GetParentFolderName(WScript.ScriptFullName)
strNodePath = ""

' Find node.exe in PATH
Set Env = WshShell.Environment("PROCESS")
For Each strDir In Split(Env("PATH"), ";")
    strDir = Trim(strDir)
    If strDir <> "" And FSO.FileExists(strDir & "\node.exe") Then
        strNodePath = strDir & "\node.exe"
        Exit For
    End If
Next

' Fallback to common install locations
If strNodePath = "" Then
    For Each strDir In Array( _
        "C:\Program Files\nodejs", _
        "C:\Program Files (x86)\nodejs", _
        Env("LOCALAPPDATA") & "\fnm\current", _
        Env("LOCALAPPDATA") & "\nvm\v20.18.0" _
    )
        If FSO.FileExists(strDir & "\node.exe") Then
            strNodePath = strDir & "\node.exe"
            Exit For
        End If
    Next
End If

If strNodePath = "" Then
    MsgBox "Node.js nao encontrado. Instale em https://nodejs.org", vbCritical, "SmartTV Media Server"
    WScript.Quit 1
End If

' Run node server.js in hidden window
WshShell.CurrentDirectory = strAppDir
strCmd = """" & strNodePath & """ """ & strAppDir & "\server.js" & """"
' 0 = hide, False = don't wait
WshShell.Run strCmd, 0, False
