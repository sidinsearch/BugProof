package main

import "testing"

func TestSum(t *testing.T) {
	cases := []struct {
		in   int
		want int
	}{
		{1, 1},
		{5, 15},
		{10, 55},
		{100, 5050},
	}
	for _, tc := range cases {
		got := Sum(tc.in)
		if got != tc.want {
			t.Errorf("Sum(%d) = %d, want %d", tc.in, got, tc.want)
		}
	}
}
