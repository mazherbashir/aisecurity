export class StaticContent {
  public static readonly header_style = `
[code]
<style>
    .bg-gray {background-color: gray; color: white;}
    .bg-green {background-color: green; color: white;}
    .info, .bg-dodgerblue {background-color: dodgerblue; color: black;}
    .verylow, .bg-yellowgreen {background-color: yellowgreen; color: black;}
    .low, .bg-gold {background-color: gold; color: black;}
    .medium, .bg-darkorange {background-color: darkorange; color: black;}
    .high, .bg-red {background-color: red; color: white;}
    .veryhigh, .bg-darkred {background-color: darkred; color: white;}
    .heading {border-radius: 5px; display: inline-block; font-weight: bold;
        padding: 5px 25px; text-transform: uppercase;}
    .highlight {padding: 2px 5px 5px;}
    .crs-rounded {border-radius: 15px; display: inline-block; font-weight: bold;
        margin: 1px; padding: 2px 7.5px; text-align: center;}
    .minwidth {min-width: 50px;}
    .textbold {font-weight: bold; font-size: 1.2em;color: red;}
    code {background: #f0f0f0; padding: 2px 4px; border-radius: 4px; font-family: monospace;}
    a {color: #0000EE; text-decoration: underline;}
</style>
`;

  public static readonly main_header = `
Code Review Services (CRS) has assessed your latest policy-level scan <code><a target="_blank" href="https://analysiscenter.veracode.com/auth/index.jsp#StaticOverview:{$accountId}:{$appId}:{$buildId}:{$analysisId}:{$static_analysis_unit_id}::::{$sandbox_id}">{$scanName}</a></code> of the <code><a target="_blank" href="https://analysiscenter.veracode.com/auth/index.jsp#HomeAppProfile:{$accountId}:{$appId}:{$buildId}">{$profile_name}</a></code> application for quality and completeness and reviewed the open findings and available mitigation proposals. If more assistance is needed, please schedule a consultation call by selecting the <i><b>Remediation Consultation</b></i> option from the appointment calendar. For more help, refer to the <i><b>Scheduling Consultations</b></i> section, as detailed in the <a class="crs-rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/:w:/r/sites/GBL-IFS-NIS-Application-Security/AppReadiness/CRS%20Documents/Client-Facing%20Documentation/CRS%20Process%20Overview.docx?d=w60b17b59a86342efa122e0767f68490f">CRS Process Overview</a> document.<br/>
<hr/>
`;

  public static readonly sastHeader = `
<style>
    table.crs {border-collapse: collapse;}
    table.crs th {text-align: left !important; white-space: nowrap;}
    table.crs th, td {border: 1px solid black; padding: 3px 5px; text-align: center;}
    table.crs tr:nth-child(even) {background-color: gainsboro;}
    table.crs td:nth-of-type(2) {text-align: left}
</style>
<p><b>Open Flaw and Mitigation Proposal Summary</b></p>
<table class='crs' border=1 cellspacing=2>
    <tr><th>Severity</th><th>Flaw</th><th>Mitigation</th><th>Count</th><th>Fix By Date</th></tr>
`;

  public static readonly sastFooter = `
</table>
<p><b><i>Low severity findings do not impede sign-off. However, low severity findings are still expected to be fixed within 180 days of identification.</i></b></p>
<hr/>
`;

  public static readonly nodeMsg =  `If this is a transitive dependency, you can utilize the <code><a target="_blank" href="https://docs.npmjs.com/cli/v8/configuring-npm/package-json#overrides">overrides</a></code> section of the <code>package.json</code> to force the dependency to a vulnerability-free version in NPM v8.3+. Otherwise, try utilizing the <code><a target="_blank" href="https://www.npmjs.com/package/force-resolutions">force-resolutions</a></code> package to force the dependency to a vulnerability-free version. Additionally, ensure that only production dependencies are included by running <code>npm install --production</code> and including the generated <code>package-lock.json</code> file in the scan.`;

  public static readonly requestMsg = `This option is not valid for the <code>request</code> component as the library has been deprecated and there are no future updates. For further guidance on mitigating the <code>request</code> vulnerabilities, see the <a class="crs-rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/:w:/r/sites/GBL-IFS-NIS-Application-Security/AppReadiness/CRS%20Documents/Client-Facing%20Documentation/CRS%20SAST%20Developer%20Guidance.docx?d=w18d11ae841444f1ba48c2efe66bc6c92&e=M7j31q&nav=eyJoIjoiMjY5MzU4NzU4In0">CRS SAST Developer Guidelines</a>.`;

  public static readonly javaMsg = `For Java/Jar files, "not used in production" is NOT a mitigation that can be approved as they may potentially be accessed using other attack vectors.`;
  
  public static readonly scaDetailHeader = `
<style>
    table.crs {border-collapse: collapse;}
    table.crs th {white-space: nowrap;}
    table.crs th, td {border: 1px solid black; padding: 3px 5px; text-align: left;}
    table.crs tr:nth-child(even) {background-color: gainsboro;}
</style>
<h4>Software Composition Analysis Table</h4>
<table class="crs" border=1 cellpadding=5>
    <tr><th><b>Component</b></th><th><b>Current Version</b></th><th><b>Security Finding(s)</b></th><th><b>Fix By Date</b></th><th><b>Vulnerability</b></th><th><b>Mitigation(s)</b></th></tr>
`;

  public static readonly footerMsg = `
<hr/>For more information about CRS, please see the <a class="crs-rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/sites/GBL-IFS-NIS-Application-Security/SitePages/Code-Review-Services.aspx">CRS SharePoint</a>.
[/code]
`;

  public static missingScaMsg(arch: string) {
    return `
<hr/>
<h3 class="heading bg-red">Missing Software Composition Analysis for ${arch}</h3></br>
A review of the third-party components in Software Composition Analysis was performed and there are no third-party components identified in this scan. It is a requirement of static code analysis to include Software Composition Analysis of third-party dependencies for a complete scan.<br/>
<br/>
Confirm if you have any third-party components/dependencies. If so, to successfully upload and scan an application that includes Veracode Software Composition Analysis, your application upload must include the appropriate <a target="_blank" href="https://docs.veracode.com/r/Understanding_the_Upload_and_Scan_Language_Support_Matrix">package manager artifacts</a> for the relevant supported language(s).
`;
  }

  public static moduleSelectionMsg(overview: any, selectedModules: string[], unselectedModules: string[]) {
    const scanLink = `https://analysiscenter.veracode.com/auth/index.jsp#AnalyzeAppModuleList:${overview.accountId}:${overview.appId}:${overview.buildId}:${overview.analysisId}:results:${overview.sandboxId || ''}`;
    const reviewModulesUrl = `https://analysiscenter.veracode.com/auth/index.jsp#AnalyzeAppModuleList:${overview.accountId}:${overview.appId}:${overview.buildId}:${overview.analysisId}:results`;

    const selectedList = selectedModules.map(m => `\t<li><code>${m}</code></li>`).join('\n');
    const unselectedList = unselectedModules.map(m => `\t<li><code>${m}</code></li>`).join('\n');

    return `
<hr/>
<h3 class="heading bg-red">Module Selection</h3></br>
Code Review Services can only take action on full application policy scans. All application-specific modules (frontend, backend, middleware, APIs, etc.) for deployment <b>must be uploaded in a single policy scan and selected as entry points</b>. Only application-specific modules should be selected as entry points, i.e. third-party components should not be selected and explicitly stated to be third-party.<br/>
<br/>
The latest policy scan <code><a target="_blank" href="${scanLink}">${overview.scanName}</a></code> has the following module(s) selected as entry points:
<ul>
${selectedList}
</ul>
However, there are other module(s) that appear to contain PwC first-party code or customized content and were not selected as entry points for the Veracode scan engine:
<ul>
${unselectedList}
</ul>
Confirm if the scan contains all the application components and their modules are all selected as entry points.<br/>
<br/>
If the scan doesn't contain all the application components and their modules, then perform a new scan that includes all application specific modules and select the modules as entry points for the scan.<br/>
<br/>
If the scan contains all the application components and their modules are not all selected as entry points, then ensure that all application specific modules are selected as entry points on the <code><a target="_blank" href="${reviewModulesUrl}">Review Modules</a></code> page and click the <code>Start Rescan</code> button to rescan.<br/>
<br/>
<b>Note:</b> If any of the newly selected entry point modules contain issues, such as missing supporting files, parsing failures, and minified files, then those issues will need to be resolved as well.<br/>
<br/>
For more information on scan quality and module selection, please see the <a target="_blank" href="https://pwceur.sharepoint.com/:w:/r/sites/GBL-IFS-NIS-Application-Security/AppReadiness/CRS%20Documents/Client-Facing%20Documentation/CRS%20Process%20Overview.docx?d=w60b17b59a86342efa122e0767f68490f&nav=eyJoIjoiMjA5MzI3MDY0NCJ9">Ensuring Scan Quality</a> section of the <a class="crs-rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/:w:/r/sites/GBL-IFS-NIS-Application-Security/AppReadiness/CRS%20Documents/Client-Facing%20Documentation/CRS%20Process%20Overview.docx?d=w60b17b59a86342efa122e0767f68490f">CRS Process Overview</a> document.
`;
  }

  public static scanTooOldMsg(overview: any) {
    const scanLink = `https://analysiscenter.veracode.com/auth/index.jsp#StaticOverview:${overview.accountId}:${overview.appId}:${overview.buildId}:${overview.analysisId}:${overview.staticAnalysisUnitId || ''}::::${overview.sandboxId || ''}`;
    return `
<h3 class="heading bg-red">Scan Too Old</h3></br>
The latest policy scan <code><a target="_blank" href="${scanLink}">${overview.scanName}</a></code> from ${overview.generationDate || '[Date]'} cannot be considered valid for sign-off as it is too old and may contain vulnerabilities that have been identified since the scan has been performed.<br/>
<br/>
Code Review Services will only take action on full application policy scans in Veracode. If a new full scan of all of the modules in the application has been completed in the sandbox, the <a target="_blank" href="https://docs.veracode.com/r/t_promote_sandbox">sandbox scan can be promoted to a policy scan</a> without the need to run a new scan.<br/>
<br/>
Additionally, CRS does not require periodic sign-off unless material production changes (see page 9 of the <a target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%20Documents/PwC%20ISP%20Terms%20and%20Definitions.pdf">PwC Information Security Policy Terms and Definitions</a>) are made. However, during the development process it is required that scans are run during all development activities to identify current risks that require remediation.`;
  }
}
