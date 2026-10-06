package otpdb

import (
	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/otpcrypto"
)

func BucketKey(
	secret []byte,
	score string,
	subject string,
) (string, error) {
	return otpcrypto.KeyedHash(
		secret,
		"club-otp-budget-v1",
		score,
		subject,
	)
}
