package com.crs_reivew_api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class CrsReivewApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(CrsReivewApiApplication.class, args);
	}

}
