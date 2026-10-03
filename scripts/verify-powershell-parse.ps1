param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path -LiteralPath $Path),
  [ref]$tokens,
  [ref]$errors
)

$result = [ordered]@{
  path = (Resolve-Path -LiteralPath $Path).Path
  parserErrorCount = @($errors).Count
  errors = @($errors | ForEach-Object {
    [ordered]@{
      message = $_.Message
      line = $_.Extent.StartLineNumber
      column = $_.Extent.StartColumnNumber
    }
  })
}

$result | ConvertTo-Json -Depth 5
if (@($errors).Count -gt 0) { exit 1 }
