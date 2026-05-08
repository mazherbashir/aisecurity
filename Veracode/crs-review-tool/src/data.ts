export const sampleReportData = {
  "overview" : {
    "applicationName" : "USA-ADV-Industry Cloud - Cloud Intelligence Platform (CIP)",
    "appId" : "1459861",
    "accountId" : "11045",
    "buildId" : "67572114",
    "analysisId" : "67530620",
    "scanName" : "MASTERSCAN",
    "generationDate" : "2026-05-06 19:13:48 UTC",
    "policyName" : "PwC_DC3HighlyConfidential_External",
    "policyComplianceStatus" : "Did Not Pass",
    "sastScore" : 91,
    "sastRating" : "C",
    "staticAnalysisUnitId" : null,
    "sandboxId" : "4606423",
    "tier" : "tier-1"
  },
  "sastSummary" : {
    "vulnerabilities" : 83,
    "breakdown" : {
      "High" : {
        "total" : 1,
        "findings" : [ {
          "cwe" : "CWE-259",
          "count" : 1,
          "date_first_occurrence" : "2026-05-06 09:32:40 UTC",
          "remediation_due_date" : "2026-05-16"
        } ]
      },
      "Low" : {
        "total" : 82,
        "findings" : [ {
          "cwe" : "CWE-117",
          "count" : 79,
          "date_first_occurrence" : "2024-03-25 07:46:56 UTC",
          "remediation_due_date" : "2024-09-21"
        }, {
          "cwe" : "CWE-201",
          "count" : 2,
          "date_first_occurrence" : "2025-01-06 07:34:13 UTC",
          "remediation_due_date" : "2025-07-05"
        }, {
          "cwe" : "CWE-597",
          "count" : 1,
          "date_first_occurrence" : "2024-06-28 07:18:14 UTC",
          "remediation_due_date" : "2024-12-25"
        } ]
      }
    }
  },
  "scaSummary" : {
    "vulnerabilities" : 29,
    "breakdown" : {
      "Very High" : {
        "total" : 3,
        "findings" : [ ]
      },
      "High" : {
        "total" : 8,
        "findings" : [ ]
      },
      "Medium" : {
        "total" : 15,
        "findings" : [ ]
      },
      "Low" : {
        "total" : 3,
        "findings" : [ ]
      }
    },
    "totalPackages" : 995,
    "totalVulnerablePackages" : 10
  },
  "scaDetails" : [ {
    "packageName" : "spring-security-oauth2-jose",
    "version" : "6.5.9",
    "firstFoundDate" : "2026-04-30 11:59:03 UTC",
    "remediation_due_date" : "2026-05-30",
    "severityCounts" : "Medium: 1",
    "cveList" : "CVE-2026-22748"
  }, {
    "packageName" : "Apache Commons Lang",
    "version" : "2.6",
    "firstFoundDate" : "2026-04-28 10:52:33 UTC",
    "remediation_due_date" : "2026-05-28",
    "severityCounts" : "Medium: 1",
    "cveList" : "CVE-2025-48924"
  }, {
    "packageName" : "Spring WebFlux",
    "version" : "6.2.17",
    "firstFoundDate" : "2026-04-29 09:41:37 UTC",
    "remediation_due_date" : "2026-10-26",
    "severityCounts" : "Low: 1",
    "cveList" : "CVE-2026-22741"
  }, {
    "packageName" : "Bouncy Castle Provider",
    "version" : "1.82",
    "firstFoundDate" : "2026-04-27 06:15:52 UTC",
    "remediation_due_date" : "2026-05-07",
    "severityCounts" : "Very High: 1, Medium: 1",
    "cveList" : "CVE-2026-0636,CVE-2026-5598"
  }, {
    "packageName" : "axios",
    "version" : "1.15.0",
    "firstFoundDate" : "2026-04-28 08:14:38 UTC",
    "remediation_due_date" : "2026-05-08",
    "severityCounts" : "Very High: 2, Medium: 5, Low: 1, High: 5",
    "cveList" : "CVE-2026-42033,CVE-2026-42034,CVE-2026-42035,CVE-2026-42036,CVE-2026-42037,CVE-2026-42038,CVE-2026-42039,CVE-2026-42040,CVE-2026-42041,CVE-2026-42042,CVE-2026-42043,CVE-2026-42044,CVE-2026-42264"
  }, {
    "packageName" : "server",
    "version" : "7.17.23",
    "firstFoundDate" : "2026-04-23 14:32:21 UTC",
    "remediation_due_date" : "2026-05-03",
    "severityCounts" : "Medium: 3, High: 1",
    "cveList" : "CVE-2024-52980,CVE-2024-52981,CVE-2025-37727,CVE-2025-37731"
  }, {
    "packageName" : "spring-boot",
    "version" : "3.5.13",
    "firstFoundDate" : "2026-04-30 11:28:23 UTC",
    "remediation_due_date" : "2026-05-10",
    "severityCounts" : "Medium: 1, High: 2",
    "cveList" : "CVE-2026-40973,CVE-2026-40975,CVE-2026-40977"
  }, {
    "packageName" : "Apache Commons Lang",
    "version" : "3.13.0",
    "firstFoundDate" : "2026-04-20 11:27:23 UTC",
    "remediation_due_date" : "2026-05-20",
    "severityCounts" : "Medium: 1",
    "cveList" : "CVE-2025-48924"
  }, {
    "packageName" : "Spring Web MVC",
    "version" : "6.2.17",
    "firstFoundDate" : "2026-04-29 09:41:36 UTC",
    "remediation_due_date" : "2026-10-26",
    "severityCounts" : "Low: 1",
    "cveList" : "CVE-2026-22741"
  }, {
    "packageName" : "spring-boot-autoconfigure",
    "version" : "3.5.13",
    "firstFoundDate" : "2026-04-30 11:21:37 UTC",
    "remediation_due_date" : "2026-05-30",
    "severityCounts" : "Medium: 2",
    "cveList" : "CVE-2026-40971,CVE-2026-40974"
  } ],
  "findingsWithCommentsSAST" : [ ],
  "findingsWithCommentsSCA" : [ {
    "type" : "SCA",
    "id" : "CVE-2025-37727",
    "cweid" : "CWE-532",
    "title" : "CVE-2025-37727",
    "severity" : "Medium",
    "location" : "server",
    "userComments" : [ "\rTechnique: M1 :  Establish and maintain control over all of your inputs\r\nSpecifics: The application mitigates CVE-2025-37727 (CWE-532) by ensuring Elasticsearch audit logging is not configured to emit reindex request bodies (i.e., xpack.security.audit.logfile.events.emit_request_body is disabled) and avoiding the specific audit event combinations that can cause sensitive reindex payload content to be written to logs.\nAdditionally, access to the _reindex API (especially remote reindex use-cases) is restricted to least-privilege administrative roles only, and audit/log files are treated as sensitive (restricted access, centralized collection, and retention controls) to prevent any inadvertent exposure.\r\nRemaining Risk: We are not going to use the specific package unless we upgrade to the suggested higher versions\r\nVerification: Scanning through the code repositories" ],
    "remediation_due_date" : "2026-05-23"
  }, {
    "type" : "SCA",
    "id" : "CVE-2025-37731",
    "cweid" : "",
    "title" : "CVE-2025-37731",
    "severity" : "High",
    "location" : "server",
    "userComments" : [ "\rTechnique: M1 :  Establish and maintain control over all of your inputs\r\nSpecifics: The application mitigates CVE-2025-37731 (Elasticsearch PKI realm improper authentication) by hardening PKI-based access so a crafted certificate cannot be used to impersonate another user: PKI authentication is limited to mTLS from trusted upstreams only and certificate issuance is restricted to a dedicated/private CA chain (no broad/public CA trust).\nElasticsearch PKI realm mappings are locked down to explicit, least-privilege identities (tight DN/SAN match rules; no permissive wildcards), and certificate revocation controls are enforced where supported.\nIn addition, audit logging and alerting are enabled for certificate-authentication events to detect anomalous principals and respond to suspected impersonation attempts.\r\nRemaining Risk: We are not going to use the specific package unless we upgrade to the suggested higher versions\r\nVerification: Scanning through the code repositories" ],
    "remediation_due_date" : "2026-05-03"
  } ],
  "unselectedModules" : [ "java-domain-objects-2.3.0.jar", "cip-ee-event-map-processor-2.2.0.jar", "JS files within US-cip-ane (4).zip", "cip-ane-notification-dispatcher-3.0.0.jar", "ane-notification-service-3.0.0.jar", "ane-rules-executor-3.0.0.jar", "cloud-intelligence-registry-3.0.0.jar", "cip-dlq-handler-3.0.0.jar", "cip-ee-event-map-executor-3.0.0.jar", "ee-event-map-flow-logger-3.0.0.jar", "cip-scheduled-maintenance-3.0.0.jar", "cip-scheduler-service-3.0.0.jar", "cip-service-handler-raer-3.0.0.jar", "cip-service-handler-3.0.0.jar", "ers-logger-service-3.0.0.jar", "cip-fsm-service-3.0.0.jar", "JS files within US-cip-jb (3).zip", "JS files within US-cip-md (1).zip" ],
  "selectedModules" : [ "cloud-intelligence-xperience-service-3.0.0.jar", "fsm-state-logger-3.0.0.jar", "fsm-sla-scheduler-service-3.0.0.jar", "cip-ers-query-service-3.0.0.jar" ],
  "architectures" : [ "Java" ],
  "scaEcosystems" : "[Java, JavaScript]",
  "packagingAnomalies" : [ "Ecosystem JavaScript detected in SCA but no corresponding architecture (JavaScript) was scanned in SAST. Check module selection." ],
  "buildInfo" : null
};
