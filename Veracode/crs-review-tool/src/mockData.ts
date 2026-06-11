import { SastFinding, ScaFinding } from './types';

export const mockOverview = {
  "applicationName": "GBL-ADV-Fusion (Replacing Map)",
  "appId": "729193",
  "accountId": "11045",
  "buildId": "67352589",
  "analysisId": "67311128",
  "scanName": "1 May 2026 Static",
  "generationDate": "2026-05-04 20:57:30 UTC",
  "submitted_date": "2026-05-04 20:57:30 UTC",
  "policyName": "PwC_DC3HighlyConfidential_Internal",
  "policyComplianceStatus": "Conditional Pass",
  "sastScore": 87,
  "sastRating": "B",
  "scanLanguages": ["JavaScript", ".NET"],
  "packagingAnomalies": [],
  "unselectedModules": ["FusionCommonLib.dll"],
  "gracePeriod": "veryhigh/high:60 , Medium:90 , Low:180",
  "minifedFiles": [],
  "noPrecompile": [
    "Pwc.Cde.Junction.Core.Benchmarking.Api.dll",
    "PwC.Cde.Junction.Core.Grunt.Library.Api.dll",
    "PwC.Cde.Junction.Core.Rtc.Headless.Api.dll",
    "PwC.Cde.Junction.Error.Code.Api.dll",
    "PwC.Cde.Junction.Html.File.Upload.Func.dll",
    "Pwc.Cde.DVtT.Diagnostics.Api.dll"
  ],
  "missingSCAForSelectedModules": [
    "Python files within Veracode_cde-junction-genai-qna-api.zip",
    "Python files within Veracode_cde-junction-genai-agent-discovery-api.zip",
    "Python files within Veracode_cde-workflows-engine-exportjunction-api.zip",
    "Python files within Veracode_cde-workflows-engine-excelformatter-api.zip",
    "Python files within Veracode_cde-workflows-engine-alphasense-api.zip",
    "Python files within Veracode_cde-workflows-engine-publicdocs-api.zip",
    "Python files within Veracode_cde-junction-genai-langflow.zip",
    "Python files within Veracode_cde-workflows-engine-ddvcarveout-api.zip",
    "Python files within Veracode_eclipse-advisory-fdd-data-science.zip",
    "Python files within Veracode_cde-workflows-publicdocs-data-refinery-api.zip",
    "Python files within Veracode_cde-junction-genai-support-api.zip"
  ]
};

export const mockSastSummary = {
  vulnerabilities: 152,
  breakdown: {
    "Very High": 0,
    "High": 1,
    "Medium": 1,
    "Low": 145,
    "Information": 4
  }
};

export const mockScaSummary = {
  vulnerabilities: 1,
  breakdown: {
    "Very High": 0,
    "High": 0,
    "Medium": 0,
    "Low": 1
  },
  totalPackages: 707,
  totalVulnerablePackages: 1
};

export const dryRunJson = {
  "overview" : {
    "applicationName" : "GBL-TAX-Sightline_Global - Documents",
    "appId" : "2319220",
    "accountId" : "11045",
    "buildId" : "66729287",
    "analysisId" : "66687946",
    "scanName" : "documents-v4 Veracode Combined for 'GBL-TAX-Sightline_Global - Documents'_master_20260421.1 Promoted",
    "generationDate" : "2026-05-05 04:11:06 UTC",
    "submitted_date" : "2026-05-05 04:11:06 UTC",
    "policyName" : "PwC_DC3HighlyConfidential_External",
    "policyComplianceStatus" : "Did Not Pass",
    "sastScore" : 98,
    "sastRating" : "B"
  },
  "sastSummary" : {
    "vulnerabilities" : 3,
    "breakdown" : "Medium: 3\n CWE-80: x 2 : date_first_occurrence=\"2026-04-07 05:05:15 UTC\"\n CWE-918: x 1 : date_first_occurrence=\"2026-04-07 05:05:15 UTC\""
  },
  "scaSummary" : {
    "vulnerabilities" : 6,
    "breakdown" : "Very High: 1, High: 4, Medium: 1, Low: 0, Very Low: 0, Info: 0",
    "totalPackages" : 1165,
    "totalVulnerablePackages" : 3
  },
  "scaDetails" : [ {
    "packageName" : "minimatch",
    "firstFoundDate" : "2026-04-09 08:31:10 UTC",
    "severityCounts" : "High: 2",
    "cveList" : "CVE-2026-26996,CVE-2026-27903"
  }, {
    "packageName" : "minimatch",
    "firstFoundDate" : "2026-04-09 08:31:11 UTC",
    "severityCounts" : "High: 2",
    "cveList" : "CVE-2026-26996,CVE-2026-27903"
  }, {
    "packageName" : "lodash",
    "firstFoundDate" : "2026-04-17 11:21:57 UTC",
    "severityCounts" : "VeryHigh: 1 Medium: 1",
    "cveList" : "CVE-2026-2950,CVE-2026-4800"
  } ],
  "scaEcosystems" : "[npm, nuget]",
  "packagingAnomalies" : [ ],
  "findingsWithCommentsSAST" : [ ],
  "findingsWithCommentsSCA" : [ ],
  "unselectedModules" : [ ],
  "selectedModules" : [ "PwC.GTT.Platform.DocumentsV4.Api.dll", "JS files within docsv4-all.zip", "PwC.GTT.Platform.EngagementsSharepoint.Functions.dll", "PwC.GTT.Platform.DocumentsV4.Functions.dll", "PwC.GTT.Platform.Shared.dll", "PwC.GTT.Platform.DocumentsV4.Integrations.dll", "PwC.GTT.Platform.Shared.Api.dll", "PwC.GTT.PlatformCore.Clients.dll", "PwC.GTT.Platform.Shared.Api.dll", "PwC.GTT.Platform.DocumentsV4.Application.dll", "PwC.GTT.Platform.EventStore.Client.dll", "PwC.GTT.Platform.DocumentsV4.Integrations.Web.dll" ],
  "architectures" : [ "JAVASCRIPT", "CIL32" ],
  "buildInfo" : null
};

export const mockSastFindings: SastFinding[] = [
  {
    "type": "SAST",
    "id": "1794",
    "cweid": "259",
    "title": "Use of Hard-coded Password",
    "severity": "High",
    "location": "googledriveaudit.cs:53",
    "userComments": [
      "This is flagging as \"Use of hard coded password\" on a call where we are using an azure keyvault to retrieve a securely stored password. No hardcoded keyvault names or passwords are used in this function"
    ]
  },
  {
    "type": "SAST",
    "id": "1436",
    "cweid": "117",
    "title": "Improper Output Neutralization for Logs",
    "severity": "Low",
    "location": "authenticationservice.cs:658",
    "userComments": [
      "Technique : M1 : Establish and maintain control over all of your inputs\nSpecifics : Internal logging information passed from authenticated endpoints with previously parsed and verified input parameters\nRemaining Risk : none\nVerification : code reviewed",
      "Proposal rejected because the proposed mitigation does not address the flaw. \nCWE-117 refers to a security weakness where an application fails to properly sanitize user-input data before writing it to log files. This can allow attackers to inject malicious content or forge log entries. The issue is related to Carriage Return and Line Feed (CRLF) characters, where a custom or built-in function needs to replace \\r and \\n.\nPlease check for more reference, https://docs.veracode.com/r/Supported_NET_Cleansing_Function",
      "Technique : M2 : Establish and maintain control over all of your outputs\nSpecifics : These are flagging for a siteURL not properly being neutralized when logging. This is passed to the function internally and is not a user entered input so there is no need to neutralize the output\nRemaining Risk : none\nVerification : code reviewed"
    ]
  },
  {
    "type": "SAST",
    "id": "1437",
    "cweid": "117",
    "title": "Improper Output Neutralization for Logs",
    "severity": "Low",
    "location": "authenticationservice.cs:695",
    "userComments": [
      "Technique : M1 : Establish and maintain control over all of your inputs\nSpecifics : Internal logging information passed from authenticated endpoints with previously parsed and verified input parameters\nRemaining Risk : none\nVerification : code reviewed",
      "Proposal rejected because the proposed mitigation does not address the flaw. \nCWE-117 refers to a security weakness where an application fails to properly sanitize user-input data before writing it to log files. This can allow attackers to inject malicious content or forge log entries. The issue is related to Carriage Return and Line Feed (CRLF) characters, where a custom or built-in function needs to replace \\r and \\n.\nPlease check for more reference, https://docs.veracode.com/r/Supported_NET_Cleansing_Function",
      "Technique : M2 : Establish and maintain control over all of your outputs\nSpecifics : These are flagging for a siteURL not properly being neutralized when logging. This is passed to the function internally and is not a user entered input so there is no need to neutralize the output\nRemaining Risk : none\nVerification : code reviewed"
    ]
  },
  {
    "type": "SAST",
    "id": "1525",
    "cweid": "117",
    "title": "Improper Output Neutralization for Logs",
    "severity": "Low",
    "location": "cosmosworkspacemetadataupdate.cs:38",
    "userComments": [
      "Technique : M1 : Establish and maintain control over all of your inputs\nSpecifics : Internally logging calls with verified inputs.\nRemaining Risk : none\nVerification : code reviewed",
      "Proposal rejected because the proposed mitigation does not address the flaw. \nCWE-117 refers to a security weakness where an application fails to properly sanitize user-input data before writing it to log files. This can allow attackers to inject malicious content or forge log entries. The issue is related to Carriage Return and Line Feed (CRLF) characters, where a custom or built-in function needs to replace \\r and \\n.\nPlease check for more reference, https://docs.veracode.com/r/Supported_NET_Cleansing_Function",
      "Technique : M2 : Establish and maintain control over all of your outputs\nSpecifics : Logging request method only. No user input logged\nRemaining Risk : none\nVerification : code reviewed"
    ]
  },
  {
    "type": "SAST",
    "id": "1462",
    "cweid": "117",
    "title": "Improper Output Neutralization for Logs",
    "severity": "Low",
    "location": "fusionservice.cs:340",
    "userComments": [
      "Technique : M1 : Establish and maintain control over all of your inputs\nSpecifics : Internally logging calls with verified inputs.\nRemaining Risk : none\nVerification : code reviewed",
      "Proposal rejected because the proposed mitigation does not address the flaw. \nCWE-117 refers to a security weakness where an application fails to properly sanitize user-input data before writing it to log files. This can allow attackers to inject malicious content or forge log entries. The issue is related to Carriage Return and Line Feed (CRLF) characters, where a custom or built-in function needs to replace \\r and \\n.\nPlease check for more reference, https://docs.veracode.com/r/Supported_NET_Cleansing_Function",
      "Technique : M2 : Establish and maintain control over all of your outputs\nSpecifics : This is a log statement if our Portfolio API call fails. This is an in system call that does not receive any user input. No need to neutralize the log statement\nRemaining Risk : none\nVerification : Code reviewed"
    ]
  },
  {
    "type": "SAST",
    "id": "1475",
    "cweid": "117",
    "title": "Improper Output Neutralization for Logs",
    "severity": "Low",
    "location": "googledriveadd.cs:93",
    "userComments": [
      "Technique : M1 : Establish and maintain control over all of your inputs\nSpecifics : Internally logging calls with verified inputs.\nRemaining Risk : none\nVerification : code reviewed",
      "Proposal rejected because the proposed mitigation does not address the flaw. \nCWE-117 refers to a security weakness where an application fails to properly sanitize user-input data before writing it to log files. This can allow attackers to inject malicious content or forge log entries. The issue is related to Carriage Return and Line Feed (CRLF) characters, where a custom or built-in function needs to replace \\r and \\n.\nPlease check for more reference, https://docs.veracode.com/r/Supported_NET_Cleansing_Function",
      "Technique : M2 : Establish and maintain control over all of your outputs\nSpecifics : These logs are not outputting any user entered data. Data is all internal and does not need to be neutralized\nRemaining Risk : none\nVerification : Code reviewed"
    ]
  },
  {
    "type": "SAST",
    "id": "1476",
    "cweid": "117",
    "title": "Improper Output Neutralization for Logs",
    "severity": "Low",
    "location": "googledriveadd.cs:124",
    "userComments": [
      "Technique : M1 : Establish and maintain control over all of your inputs\nSpecifics : Internally logging calls with verified inputs.\nRemaining Risk : none\nVerification : code reviewed",
      "Proposal rejected because the proposed mitigation does not address the flaw. \nCWE-117 refers to a security weakness where an application fails to properly sanitize user-input data before writing it to log files. This can allow attackers to inject malicious content or forge log entries. The issue is related to Carriage Return and Line Feed (CRLF) characters, where a custom or built-in function needs to replace \\r and \\n.\nPlease check for more reference, https://docs.veracode.com/r/Supported_NET_Cleansing_Function",
      "Technique : M2 : Establish and maintain control over all of your outputs\nSpecifics : These logs are not outputting any user entered data. Data is all internal and does not need to be neutralized\nRemaining Risk : none\nVerification : Code reviewed"
    ]
  },
  {
    "type": "SAST",
    "id": "1511",
    "cweid": "117",
    "title": "Improper Output Neutralization for Logs",
    "severity": "Low",
    "location": "googledrivetoken.cs:37",
    "userComments": [
      "Technique : M1 : Establish and maintain control over all of your inputs\nSpecifics : Internally logging calls with verified inputs.\nRemaining Risk : none\nVerification : code reviewed",
      "Proposal rejected because the proposed mitigation does not address the flaw. \nCWE-117 refers to a security weakness where an application fails to properly sanitize user-input data before writing it to log files. This can allow attackers to inject malicious content or forge log entries. The issue is related to Carriage Return and Line Feed (CRLF) characters, where a custom or built-in function needs to replace \\r and \\n.\nPlease check for more reference, https://docs.veracode.com/r/Supported_NET_Cleansing_Function",
      "Technique : M2 : Establish and maintain control over all of your outputs\nSpecifics : Just is logging the request method information. No user input logged.\nRemaining Risk : none\nVerification : code reviewed",
      "Technique : M2 : Establish and maintain control over all of your outputs\nSpecifics : Logging request method only. No user input logged\nRemaining Risk : none\nVerification : code reviewed"
    ]
  },
  {
    "type": "SAST",
    "id": "1527",
    "cweid": "117",
    "title": "Improper Output Neutralization for Logs",
    "severity": "Low",
    "location": "pnpservice.cs:386",
    "userComments": [
      "Technique : M1 : Establish and maintain control over all of your inputs\nSpecifics : Internally logging calls with verified inputs.\nRemaining Risk : none\nVerification : code reviewed",
      "Proposal rejected because the proposed mitigation does not address the flaw. \nCWE-117 refers to a security weakness where an application fails to properly sanitize user-input data before writing it to log files. This can allow attackers to inject malicious content or forge log entries. The issue is related to Carriage Return and Line Feed (CRLF) characters, where a custom or built-in function needs to replace \\r and \\n.\nPlease check for more reference, https://docs.veracode.com/r/Supported_NET_Cleansing_Function",
      "Technique : M2 : Establish and maintain control over all of your outputs\nSpecifics : Internally logged variables. No user input logged, logs do not need to be neutralized\nRemaining Risk : none\nVerification : code reviewed"
    ]
  },
  {
    "type": "SAST",
    "id": "1528",
    "cweid": "117",
    "title": "Improper Output Neutralization for Logs",
    "severity": "Low",
    "location": "pnpservice.cs:425",
    "userComments": [
      "Technique : M1 : Establish and maintain control over all of your inputs\nSpecifics : Internally logging calls with verified inputs.\nRemaining Risk : none\nVerification : code reviewed",
      "Proposal rejected because the proposed mitigation does not address the flaw. \nCWE-117 refers to a security weakness where an application fails to properly sanitize user-input data before writing it to log files. This can allow attackers to inject malicious content or forge log entries. The issue is related to Carriage Return and Line Feed (CRLF) characters, where a custom or built-in function needs to replace \\r and \\n.\nPlease check for more reference, https://docs.veracode.com/r/Supported_NET_Cleansing_Function",
      "Technique : M2 : Establish and maintain control over all of your outputs\nSpecifics : Internally logged variables. No user input logged, logs do not need to be neutralized\nRemaining Risk : none\nVerification : code reviewed"
    ]
  },
  {
    "type": "SAST",
    "id": "1500",
    "cweid": "117",
    "title": "Improper Output Neutralization for Logs",
    "severity": "Low",
    "location": "workspacefolder.cs:76",
    "userComments": [
      "Technique : M1 : Establish and maintain control over all of your inputs\nSpecifics : Internally logging calls with verified inputs.\nRemaining Risk : none\nVerification : code reviewed",
      "Proposal rejected because the proposed mitigation does not address the flaw. \nCWE-117 refers to a security weakness where an application fails to properly sanitize user-input data before writing it to log files. This can allow attackers to inject malicious content or forge log entries. The issue is related to Carriage Return and Line Feed (CRLF) characters, where a custom or built-in function needs to replace \\r and \\n.\nPlease check for more reference, https://docs.veracode.com/r/Supported_NET_Cleansing_Function",
      "Technique : M2 : Establish and maintain control over all of your outputs\nSpecifics : All logged items are internal and not user imputs. No neutralization needed.\nRemaining Risk : none\nVerification : code reviewed"
    ]
  },
  {
    "type": "SAST",
    "id": "1495",
    "cweid": "209",
    "title": "Generation of Error Message Containing Sensitive Information",
    "severity": "Low",
    "location": "workerextensionstartupcodeexecutor.g.cs:24",
    "userComments": [
      "Technique : M1 : Establish and maintain control over all of your inputs\nSpecifics : Azure worker functions logging\nRemaining Risk : none\nVerification : code reviewed",
      "Proposal rejected because the proposed mitigation does not address the flaw.\nPlease explain what type of message the application returns when an exception occurs. Ensure that no exception or error messages containing potentially sensitive or verbose information are shown to the user. Always display static and controlled messages. Implement default error pages or messages that do not leak any internal details.",
      "These are flags on the microsoft.azure.sdk worker function error messages. These are not controlled by our code and are built into the sdk"
    ]
  },
  {
    "type": "SAST",
    "id": "1556",
    "cweid": "209",
    "title": "Generation of Error Message Containing Sensitive Information",
    "severity": "Low",
    "location": "workerextensionstartupcodeexecutor.g.cs:24",
    "userComments": [
      "Technique : M1 : Establish and maintain control over all of your inputs\nSpecifics : Azure worker functions logging\nRemaining Risk : none\nVerification : code reviewed",
      "Proposal rejected because the proposed mitigation does not address the flaw.\nPlease explain what type of message the application returns when an exception occurs. Ensure that no exception or error messages containing potentially sensitive or verbose information are shown to the user. Always display static and controlled messages. Implement default error pages or messages that do not leak any internal details.",
      "These are flags on the microsoft.azure.sdk worker function error messages. These are not controlled by our code and are built into the sdk"
    ]
  },
  {
    "type": "SAST",
    "id": "1441",
    "cweid": "201",
    "title": "Insertion of Sensitive Information Into Sent Data",
    "severity": "Low",
    "location": "fusionavepointintegrationservice.asmx.cs:195",
    "userComments": [
      "Technique : M1 : Establish and maintain control over all of your inputs\nSpecifics : Internal Avepoint integration calls that hit our own endpoints. We have control over all data in and out of this integration service.\nRemaining Risk : none\nVerification : code reviewed",
      "Proposal rejected because more information is required.\n The Veracode identified that the application is sending sensitive data. Please describe what data is being sent in the line of code Veracode has identified the issue. If data is intentionally sent, confirm whether it is sensitive data and, if so, include encryption of the data in transit (e.g.., using TLS1.2/HTTPS) \n",
      "Technique : M5 : Use industry-accepted security features instead of inventing your own\nSpecifics : These are flagged in our avepoint integration service in which we communicate errors and request information between our API, Azure, and our Avepoint Service. These calls are made using Https post requests that go through our own internal Azure workflows to trigger/receive information from avepoint. The data being sent is not sensitive information and just contains non PII/non sensitive site/request information.\nRemaining Risk : None\nVerification : Reviewed out stored endpoints/azure workflows to confirm they are being sent over https connection. Request data reviewed to confirm no sensitive information is being sent"
    ]
  }
];

export const mockScaFindings: ScaFinding[] = [
  {
    "type": "SCA",
    "id": "CVE-2025-69873",
    "cweid": "CWE-1333",
    "title": "CVE-2025-69873",
    "severity": "Low",
    "location": "ajv",
    "userComments": [
      "Technique: GP3 : Use a broad mix of methods to comprehensively find and prevent weaknesses\nSpecifics: This is a subdepency package and is not directly implemented in our code. I have applied overrides in our package.json to subvert other dependencies from using vulnerable version as well\nRemaining Risk: Low/minimal\nVerification: Applied version overrides in package.json for the project. Code reviewed",
      "Technique: M5 : Use industry-accepted security features instead of inventing your own\nSpecifics: These components/packages are 3rd party components used by other packages in our solution. As an additional layer of security, I have utilized NPMs \"Overrides\" section in our package.json to force a non vulnerable version of the packages when possible.\nRemaining Risk: Minimal to none\nVerification: Code reviewed and safety plan implemented for our next production release"
    ]
  }
];
