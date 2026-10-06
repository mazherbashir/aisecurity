import snippetsData from "./data/snippets.json";

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
    .veryhigh, .critical, .bg-darkred {background-color: darkred; color: white;}
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
    const scanLink = `https://analysiscenter.veracode.com/auth/index.jsp#StaticOverview:${overview.accountId}:${overview.appId}:${overview.buildId}:${overview.analysisId}:${overview.staticAnalysisUnitId}::::${overview.sandboxId || ''}`;
    const reviewModulesUrl = `https://analysiscenter.veracode.com/auth/index.jsp#AnalyzeAppModuleList:${overview.accountId}:${overview.appId}:${overview.buildId}:${overview.analysisId}:${overview.staticAnalysisUnitId}:::results:${overview.sandboxId}`;

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
The latest policy scan <code><a target="_blank" href="${scanLink}">${overview.scanName}</a></code> from ${overview.submitted_date || overview.generationDate || '[Date]'} cannot be considered valid for sign-off as it is too old and may contain vulnerabilities that have been identified since the scan has been performed.<br/>
<br/>
Code Review Services will only take action on full application policy scans in Veracode. If a new full scan of all of the modules in the application has been completed in the sandbox, the <a target="_blank" href="https://docs.veracode.com/r/t_promote_sandbox">sandbox scan can be promoted to a policy scan</a> without the need to run a new scan.<br/>
<br/>
Additionally, CRS does not require periodic sign-off unless material production changes (see page 9 of the <a target="_blank" href="https://pwceur.sharepoint.com/sites/NetworkInformationSecurityPolicyIsp/Shared%20Documents/PwC%20ISP%20Terms%20and%20Definitions.pdf">PwC Information Security Policy Terms and Definitions</a>) are made. However, during the development process it is required that scans are run during all development activities to identify current risks that require remediation.`;
  }

  public static noPrecompileMsg() {
    return `
<hr/>
<h3 class="heading bg-red">Missing Precompiled Files</h3></br>
The scan reported <i>Support Issue: No precompiled files were found for this .NET web application</i> in the uploaded modules. If your application has any ASP.NET front-end code, then the application must be precompiled to include the front-end code for scanning.<br/>
<br/>
Confirm if this application has ASP.NET front-end code, and <b>if so, precompile and rescan</b>. See Veracode's documentation on <a target="_blank" href="https://docs.veracode.com/r/compilation_ASPnet">Packaging ASP.NET Web Applications</a> for more information.`;
  }

  public static minifiedFilesMsg(minifedFiles: string[]) {
    const listItems = minifedFiles.map(file => `\t<li><code>${file}</code></li>`).join("\n");
    return `
<hr/>
<h3 class="heading bg-red">Minified Files</h3></br>
The scan reported <i>Support Issue: Ignored file [filename] because we think it is minified</i> in the uploaded modules selected as entry points. Code Review Services can only take action on full application policy scans and ignored files can affect the completeness of the scan.<br/>
<br/>
Ensure that all application-specific files are uploaded unminified in a single policy scan. <b>Only application-specific files must be unminified</b>, i.e. third-party files can be minified if they are explicitly stated to be third-party.<br/>
<br/>
Confirm if the file(s) below are required for production, and <b>if so, unminify the file(s) and rescan</b>:<br/>
<br/>
<b> Minified files exists in the following module(s)</b>
<ul>
${listItems}
</ul>
<b>Note:</b> The Veracode scan engine uses line length in determining if a file is minified. If the file is not minified but is reported as such, ensure that there are no lines with a length of 500 or more characters.`;
  }

  public static invalidProfileMsg(profileName: string, ritmNumber: string) {
    const cleanProfile = (profileName || "Application Profile").trim();
    const cleanRitm = (ritmNumber || "RITM").trim();
    return `
The application profile
<span class="rounded bg-red highlight">${cleanProfile}</span>
submitted with this <b>${cleanRitm}</b> does not correspond to an existing application profile in Veracode.

<p><b>Before Code Review Services can proceed</b>, please provide the correct Veracode application profile.</p>

<div style="border:1px solid #f0ad4e; background-color:#fcf8e3; color:#8a6d3b; padding:10px; border-radius:5px; margin-top:10px;">
    <b>Important:</b> The provided application profile could not be found in Veracode.
    <br/><br/>
    If no application profile exists yet, the application has not been onboarded to the scanning platform. According to <a target="_blank" href="https://pwceur.sharepoint.com/:p:/r/sites/GBL-IFS-NIS-Application-Security/_layouts/15/Doc.aspx?sourcedoc=%7B7D36A28C-D1A4-4D48-B044-9A25AC0DA588%7D&file=CRS%20High%20Level%20User%20Guide.pptx&action=edit&mobileredirect=true">CRS High Level User Guide.pptx</a>, you must first submit a <b>Create Scanning Tool Profile</b> request during the onboarding phase.
    <br/><br/>
    You can begin the onboarding process by submitting a
    <a target="_blank" href="https://pwcnetwork.service-now.com/hub?id=sc_cat_item&sys_id=6382512ddb59bf40dbf414a05b96194e">Create Scanning Tool Profile</a>
 
    request.
    <br/><br/>
    The current request was submitted as a <b>Sign-off Request</b>, which is the final stage of the CRS process and requires an existing application profile, completed scan results, and remediation/mitigation activities to be completed before CRS can perform a review.
    <br/><br/>
    <b>CRS Process Summary:</b>
    <ol style="margin-top:5px;">
        <li><b>Phase 1 - Onboarding:</b> Register the application and submit a <i>Create Scanning Tool Profile</i> request.</li>
        <li><b>Phase 2 - Scan and Review Results:</b> Upload code and perform Veracode scans.</li>
        <li><b>Phase 3 - Remediate and Mitigate Findings:</b> Address scan findings and submit mitigation proposals if required.</li>
        <li><b>Phase 4 - Request Sign-off:</b> Submit a Sign-off Request after the previous phases have been completed.</li>
    </ol>

    Please submit a <b>Create Scanning Tool Profile</b> request and wait for confirmation that the application profile has been created. Once the profile is available, complete the required scans, review and remediate any findings, obtain mitigation approvals where applicable, and submit a Sign-off Request only after all preceding CRS phases have been completed.
</div>

<hr/>

If more assistance is needed, please schedule a consultation call by selecting the <i><b>Remediation Consultation</b></i> option from the appointment calendar. For more help, refer to the <i><b>Scheduling Consultations</b></i> section, as detailed in the <a class="rounded bg-gray" target="_blank" href="https://pwceur.sharepoint.com/:w:/r/sites/GBL-IFS-NIS-Application-Security/AppReadiness/CRS%20Documents/Client-Facing%20Documentation/CRS%20Process%20Overview.docx?d=w60b17b59a86342efa122e0767f68490f">CRS Process Overview</a> document.
<br/>
`;
  }

  public static generateInvalidProfileHtml(profileName: string, ritmNumber: string) {
    return StaticContent.header_style + StaticContent.invalidProfileMsg(profileName, ritmNumber) + StaticContent.footerMsg;
  }

  public static generateSnippetHtml(snippetText: string) {
    return StaticContent.header_style + snippetText + StaticContent.footerMsg;
  }

  public static generateNoResponseHtml(snippetText?: string) {
    const content = snippetText || (snippetsData as Record<string, string>)["No-Response"] || "";
    return StaticContent.generateSnippetHtml(content);
  }

  public static generateResponseNeededHtml(snippetText?: string) {
    const content = snippetText || (snippetsData as Record<string, string>)["Response-Needed"] || "";
    return StaticContent.generateSnippetHtml(content);
  }
}
