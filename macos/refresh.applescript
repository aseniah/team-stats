set repoDir to do shell script "cat " & quoted form of POSIX path of (path to resource "repo-dir")
set refreshScript to repoDir & "/refresh.sh"
set helper to POSIX path of (path to resource "progress.sh")
set logDir to POSIX path of (path to library folder from user domain) & "Logs/"
set logFile to logDir & "TeamStats-refresh.log"
set statusFile to logDir & "TeamStats-refresh.status"

set progress total steps to 100
set progress completed steps to 0
set progress description to "Refreshing TeamStats…"
set progress additional description to "Starting"

-- do shell script blocks the applet's UI, so run the refresh in the background and poll.
set job to "( " & quoted form of refreshScript & " > " & quoted form of logFile & " 2>&1; echo $? > " & quoted form of statusFile & " ) > /dev/null 2>&1 &"
do shell script ": > " & quoted form of logFile & "; : > " & quoted form of statusFile & "; /bin/zsh -lc " & quoted form of job

set AppleScript's text item delimiters to tab
try
	repeat
		delay 0.5
		if (do shell script "test -s " & quoted form of statusFile & " && echo done || true") is "done" then exit repeat
		set report to do shell script "/bin/sh " & quoted form of helper & " " & quoted form of logFile
		set progress completed steps to (text item 1 of report) as integer
		set progress additional description to text item 2 of report
	end repeat
on error number -128
	return
end try

set progress completed steps to 100
if (do shell script "cat " & quoted form of statusFile) is "0" then
	display notification "Reports rebuilt" with title "TeamStats"
else
	set logTail to do shell script "tail -n 12 " & quoted form of logFile
	set choice to button returned of (display dialog "Refresh failed." & return & return & logTail buttons {"Show Log", "OK"} default button "OK" with title "TeamStats" with icon stop)
	if choice is "Show Log" then do shell script "open -e " & quoted form of logFile
end if
