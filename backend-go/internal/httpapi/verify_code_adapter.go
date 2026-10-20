package httpapi

import (
	"context"

	"github.com/mhmmdmhdvi/Customers_Club/backend-go/internal/phoneverification"
)

// phoneProofVerifier describes the verification
// method provided by phoneverification.Service.
type phoneProofVerifier interface {
	VerifyPhone(
		ctx context.Context,
		phone string,
		code string,
		ip string,
	) (phoneverification.VerificationResult, error)
}

// verifyCodeAdapter converts phone-verification
// results into the HTTP API's response type.
type verifyCodeAdapter struct {
	verifier phoneProofVerifier
}

// NewVerifyCodeAdapter connects a phone-verification
// service to the HTTP verification handler.
func NewVerifyCodeAdapter(
	verifier phoneProofVerifier,
) VerifyCodeService {
	if verifier == nil {
		return nil
	}

	return &verifyCodeAdapter{
		verifier: verifier,
	}
}

func (a *verifyCodeAdapter) VerifyPhone(
	ctx context.Context,
	phone string,
	code string,
	ip string,
) (VerifyCodeResult, error) {
	proof, err := a.verifier.VerifyPhone(
		ctx,
		phone,
		code,
		ip,
	)

	if err != nil {
		return VerifyCodeResult{}, err
	}

	return VerifyCodeResult{
		NextStep:              proof.NextStep,
		Authenticated:         proof.Authenticated,
		VerificationToken:     proof.VerificationToken,
		VerificationExpiresAt: proof.VerificationExpiresAt,
	}, nil
}
