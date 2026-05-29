package com.crs_reivew_api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class CrsReivewApiApplication {

	public static void main(String[] args) {
		System.setProperty("jdk.httpclient.allowRestrictedHeaders", "proxy-authorization");
		SpringApplication.run(CrsReivewApiApplication.class, args);
	}

}
