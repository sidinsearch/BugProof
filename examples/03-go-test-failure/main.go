// Demo: a Go program that fails its test suite due to an off-by-one error.
package main

import "fmt"

// Sum returns the sum of integers from 1 to n inclusive.
// Bug: the upper bound is wrong (i < n instead of i <= n), so it sums 1..n-1.
func Sum(n int) int {
	total := 0
	for i := 1; i < n; i++ {
		total += i
	}
	return total
}

func main() {
	fmt.Println("Sum(10) =", Sum(10))
}
