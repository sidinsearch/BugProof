// Demo: a Java program that fails with a ClassNotFoundException at runtime.
// Reflectively loads a class that doesn't exist on the classpath — a real
// bug class that JVM-language devs hit when packaging is misconfigured.

public class App {
    public static void main(String[] args) throws Exception {
        System.out.println("loading driver...");

        // This class is intentionally not on the classpath. In production,
        // this is what happens when a Maven/Gradle dependency is declared
        // 'provided' or 'test' but needed at runtime.
        Class.forName("com.example.MissingDriver");

        System.out.println("driver loaded successfully");
    }
}
