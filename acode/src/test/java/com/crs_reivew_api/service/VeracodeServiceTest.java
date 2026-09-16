package com.crs_reivew_api.service;

import com.crs_reivew_api.config.VeracodeConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

public class VeracodeServiceTest {

    @InjectMocks
    private VeracodeService veracodeService;

    @Mock
    private VeracodeConfig veracodeConfig;

    @BeforeEach
    public void setUp() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    public void testIsModuleIgnored_SystemDotNetAssemblies() {
        // Mock ignore modules list containing standard ignores
        when(veracodeConfig.getIgnoreModules()).thenReturn(Arrays.asList("Microsoft", "Azure", "System", "AspNetCore"));

        // Standard system assemblies should be ignored
        assertTrue(veracodeService.isModuleIgnored("System.dll", null));
        assertTrue(veracodeService.isModuleIgnored("System.Web.dll", null));
        assertTrue(veracodeService.isModuleIgnored("Microsoft.Extensions.Logging.dll", null));
        assertTrue(veracodeService.isModuleIgnored("Azure.Identity.dll", null));
        assertTrue(veracodeService.isModuleIgnored("MyCompany.System.dll", null));
    }

    @Test
    public void testIsModuleIgnored_CustomModulesShouldNotBeIgnored() {
        when(veracodeConfig.getIgnoreModules()).thenReturn(Arrays.asList("Microsoft", "Azure", "System", "AspNetCore"));

        // Custom archives containing 'system', 'microsoft', or 'azure' as part of their names should NOT be ignored
        assertFalse(veracodeService.isModuleIgnored("Python files within veracode-auto-pack-api-biz-system-review-workspace-python.zip", "veracode-auto-pack-api-biz-system-review-workspace-python.zip"));
        assertFalse(veracodeService.isModuleIgnored("JS files within microsoft-teams-integration-js.zip", "microsoft-teams-integration-js.zip"));
        assertFalse(veracodeService.isModuleIgnored("Python files within azure-storage-service-python.zip", "azure-storage-service-python.zip"));
    }

    @Test
    public void testIsModuleIgnored_OtherIgnoredModules() {
        when(veracodeConfig.getIgnoreModules()).thenReturn(Arrays.asList("Newtonsoft", "BouncyCastle", ".map"));

        // Other ignores should continue to use contains check
        assertTrue(veracodeService.isModuleIgnored("Newtonsoft.Json.dll", null));
        assertTrue(veracodeService.isModuleIgnored("my-library.js.map", null));
        assertFalse(veracodeService.isModuleIgnored("CustomLibrary.dll", null));
    }

    @Test
    public void testReportStatusSerialization() throws Exception {
        String uuid = java.util.UUID.randomUUID().toString();
        VeracodeService.ReportStatus status = new VeracodeService.ReportStatus(uuid, "22000568", "PENDING", null);
        
        java.nio.file.Path statusPath = java.nio.file.Paths.get("veracode", "reports", uuid + ".json");
        java.nio.file.Files.createDirectories(statusPath.getParent());
        
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        mapper.writeValue(statusPath.toFile(), status);
        
        assertTrue(java.nio.file.Files.exists(statusPath));
        
        VeracodeService.ReportStatus loaded = mapper.readValue(statusPath.toFile(), VeracodeService.ReportStatus.class);
        org.junit.jupiter.api.Assertions.assertEquals(uuid, loaded.uuid);
        org.junit.jupiter.api.Assertions.assertEquals("22000568", loaded.buildId);
        org.junit.jupiter.api.Assertions.assertEquals("PENDING", loaded.status);
        
        // Clean up
        java.nio.file.Files.deleteIfExists(statusPath);
    }

    @Test
    public void testMapToPrettyName_AndroidWithSastContext() {
        java.util.Map<String, String> mappings = new java.util.LinkedHashMap<>();
        mappings.put("Go", "go,golang,GO,GOLANG");
        mappings.put("Java", "maven,gradle,JAVA,JVM,jar,bytecode");
        mappings.put("JavaScript", "npm,bower,JAVASCRIPT");
        mappings.put("NET", "nuget,CIL32,MSIL");
        mappings.put("PHP", "composer,PHP,Packagist");
        mappings.put("Python", "pip,pypi,PYTHON");
        mappings.put("Ruby", "rubygems,RUBY");
        mappings.put("Android", "java,maven,gradle,jar,bytecode,aar,apk,JVM");

        when(veracodeConfig.getArchitectureMappings()).thenReturn(mappings);

        java.util.Set<String> androidContext = java.util.Collections.singleton("Android");

        // When active SAST architecture is Android, Java/Maven/Gradle/JAR dependencies should map to Android
        org.junit.jupiter.api.Assertions.assertEquals("Android", veracodeService.mapToPrettyName("maven", androidContext));
        org.junit.jupiter.api.Assertions.assertEquals("Android", veracodeService.mapToPrettyName("java", androidContext));
        org.junit.jupiter.api.Assertions.assertEquals("Android", veracodeService.mapToPrettyName("jar", androidContext));
        org.junit.jupiter.api.Assertions.assertEquals("Android", veracodeService.mapToPrettyName("bytecode", androidContext));
        org.junit.jupiter.api.Assertions.assertEquals("Android", veracodeService.mapToPrettyName("gradle", androidContext));
    }

    @Test
    public void testMapToPrettyName_AllConfiguredArchitectures() {
        java.util.Map<String, String> mappings = new java.util.LinkedHashMap<>();
        mappings.put("Go", "go,golang,GO,GOLANG");
        mappings.put("Java", "maven,gradle,JAVA,JVM,jar,bytecode");
        mappings.put("JavaScript", "npm,bower,JAVASCRIPT");
        mappings.put("NET", "nuget,CIL32,MSIL");
        mappings.put("PHP", "composer,PHP,Packagist");
        mappings.put("Python", "pip,pypi,PYTHON");
        mappings.put("Ruby", "rubygems,RUBY");
        mappings.put("Android", "java,maven,gradle,jar,bytecode,aar,apk,JVM");

        when(veracodeConfig.getArchitectureMappings()).thenReturn(mappings);

        // Verify each architecture resolves correctly with its respective SAST context
        org.junit.jupiter.api.Assertions.assertEquals("Go", veracodeService.mapToPrettyName("golang", java.util.Collections.singleton("Go")));
        org.junit.jupiter.api.Assertions.assertEquals("Java", veracodeService.mapToPrettyName("maven", java.util.Collections.singleton("Java")));
        org.junit.jupiter.api.Assertions.assertEquals("JavaScript", veracodeService.mapToPrettyName("npm", java.util.Collections.singleton("JavaScript")));
        org.junit.jupiter.api.Assertions.assertEquals("NET", veracodeService.mapToPrettyName("nuget", java.util.Collections.singleton("NET")));
        org.junit.jupiter.api.Assertions.assertEquals("PHP", veracodeService.mapToPrettyName("composer", java.util.Collections.singleton("PHP")));
        org.junit.jupiter.api.Assertions.assertEquals("Python", veracodeService.mapToPrettyName("pip", java.util.Collections.singleton("Python")));
        org.junit.jupiter.api.Assertions.assertEquals("Ruby", veracodeService.mapToPrettyName("rubygems", java.util.Collections.singleton("Ruby")));
    }

    @Test
    public void testMapToPrettyName_FallbackWhenNoSastContextMatches() {
        java.util.Map<String, String> mappings = new java.util.LinkedHashMap<>();
        mappings.put("Go", "go,golang,GO,GOLANG");
        mappings.put("Java", "maven,gradle,JAVA,JVM,jar,bytecode");
        mappings.put("Python", "pip,pypi,PYTHON");
        mappings.put("Android", "java,maven,gradle,jar,bytecode,aar,apk,JVM");

        when(veracodeConfig.getArchitectureMappings()).thenReturn(mappings);

        // If SAST context is Android, but raw ecosystem is 'pip' (Python), fallback should correctly return 'Python'
        java.util.Set<String> androidContext = java.util.Collections.singleton("Android");
        org.junit.jupiter.api.Assertions.assertEquals("Python", veracodeService.mapToPrettyName("pip", androidContext));
    }
}
