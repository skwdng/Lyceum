package com.siyige;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SiyigeApplication {
    public static void main(String[] args) {
        SpringApplication.run(SiyigeApplication.class, args);
    }
}
