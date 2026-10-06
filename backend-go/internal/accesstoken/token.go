package accesstoken

import (
	"encoding/json"
	"errors"
	"math"
	"regexp"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const maxSafeInteger = 9007199254740991

var sessionIDPattern = regexp.MustCompile(
	`(?i)^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`,
)

var subjectPattern = regexp.MustCompile(
	`^[1-9][0-9]{0,15}$`,
)

type VerifiedClaims struct {
	UserID    int64
	SessionID string
}

var errInvalidConfig = errors.New("access token configuration error")

var errInvalidToken = errors.New("invalid access token")

type Config struct {
	Secret           []byte
	Issuer           string
	Audience         string
	AccessTTLSeconds int
	Now              func() time.Time
}

type Service struct {
	config Config
}

type IssueResult struct {
	AccessToken     string
	ExpiresIn       int
	AccessExpiresAt string
}

func New(config Config) (*Service, error) {
	if len(config.Secret) != 32 ||
		config.Issuer == "" ||
		config.Audience == "" ||
		config.AccessTTLSeconds < 1 ||
		config.AccessTTLSeconds > 900 {
		return nil, errInvalidConfig
	}

	if config.Now == nil {
		config.Now = time.Now
	}

	return &Service{
		config: config,
	}, nil
}

func (s *Service) Issue(
	userID int64,
	sessionID string,
	sessionExpiresAt time.Time,
) (IssueResult, error) {
	if userID < 1 ||
		userID > maxSafeInteger ||
		!sessionIDPattern.MatchString(
			sessionID,
		) {
		return IssueResult{}, errInvalidToken
	}

	now :=
		s.config.Now().
			UTC().
			Truncate(time.Second)

	exp :=
		now.Add(
			time.Duration(
				s.config.AccessTTLSeconds,
			) * time.Second,
		)

	sessionExpiry :=
		sessionExpiresAt.
			UTC().
			Truncate(time.Second)

	if sessionExpiry.Before(exp) {
		exp = sessionExpiry
	}

	if !exp.After(now) {
		return IssueResult{}, errInvalidToken
	}

	claims := jwt.MapClaims{
		"sid":      sessionID,
		"tokenUse": "access",
		"iss":      s.config.Issuer,
		"aud":      s.config.Audience,
		"sub":      strconv.FormatInt(userID, 10),
		"iat":      now.Unix(),
		"exp":      exp.Unix(),
	}

	token :=
		jwt.NewWithClaims(
			jwt.SigningMethodHS256,
			claims,
		)

	token.Header["typ"] = "JWT"

	signed, err :=
		token.SignedString(
			s.config.Secret,
		)

	if err != nil {
		return IssueResult{}, errInvalidToken
	}

	return IssueResult{
		AccessToken: signed,
		ExpiresIn: int(
			exp.Sub(now).Seconds(),
		),
		AccessExpiresAt: exp.Format(
			"2006-01-02T15:04:05.000Z",
		),
	}, nil
}

func (s *Service) Verify(
	rawToken string,
) (VerifiedClaims, error) {
	if rawToken == "" ||
		len(rawToken) > 4096 {
		return VerifiedClaims{}, errInvalidToken
	}

	claims := jwt.MapClaims{}

	parser := jwt.NewParser(
		jwt.WithValidMethods(
			[]string{"HS256"},
		),
		jwt.WithJSONNumber(),
		jwt.WithTimeFunc(
			s.config.Now,
		),
		jwt.WithLeeway(0),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithIssuer(
			s.config.Issuer,
		),
		jwt.WithAudience(
			s.config.Audience,
		),
	)

	token, err :=
		parser.ParseWithClaims(
			rawToken,
			claims,
			func(
				token *jwt.Token,
			) (any, error) {
				if token.Method.Alg() !=
					"HS256" {
					return nil,
						errInvalidToken
				}

				return s.config.Secret, nil
			},
		)

	if err != nil ||
		token == nil ||
		!token.Valid {
		return VerifiedClaims{},
			errInvalidToken
	}

	if token.Header["alg"] != "HS256" ||
		token.Header["typ"] != "JWT" {
		return VerifiedClaims{},
			errInvalidToken
	}

	if claims["tokenUse"] != "access" {
		return VerifiedClaims{},
			errInvalidToken
	}

	issuer, ok :=
		claims["iss"].(string)

	if !ok ||
		issuer != s.config.Issuer {
		return VerifiedClaims{},
			errInvalidToken
	}

	audience, ok :=
		claims["aud"].(string)

	if !ok ||
		audience != s.config.Audience {
		return VerifiedClaims{},
			errInvalidToken
	}

	subject, ok :=
		claims["sub"].(string)

	if !ok ||
		!subjectPattern.MatchString(
			subject,
		) {
		return VerifiedClaims{},
			errInvalidToken
	}

	userID, err :=
		strconv.ParseInt(
			subject,
			10,
			64,
		)

	if err != nil ||
		userID < 1 ||
		userID > maxSafeInteger {
		return VerifiedClaims{},
			errInvalidToken
	}

	sessionID, ok :=
		claims["sid"].(string)

	if !ok ||
		!sessionIDPattern.MatchString(
			sessionID,
		) {
		return VerifiedClaims{},
			errInvalidToken
	}

	issuedAt, ok :=
		integerClaim(
			claims["iat"],
		)

	if !ok {
		return VerifiedClaims{},
			errInvalidToken
	}

	expiresAt, ok :=
		integerClaim(
			claims["exp"],
		)

	if !ok {
		return VerifiedClaims{},
			errInvalidToken
	}

	now :=
		s.config.Now().
			Unix()

	if issuedAt > now ||
		expiresAt <= now ||
		expiresAt <= issuedAt ||
		expiresAt-issuedAt >
			int64(
				s.config.
					AccessTTLSeconds,
			) {
		return VerifiedClaims{},
			errInvalidToken
	}

	return VerifiedClaims{
		UserID:    userID,
		SessionID: sessionID,
	}, nil
}

func integerClaim(
	value any,
) (int64, bool) {
	var number float64

	switch value := value.(type) {
	case json.Number:
		parsed, err :=
			value.Float64()

		if err != nil {
			return 0, false
		}

		number = parsed

	case float64:
		number = value

	default:
		return 0, false
	}

	if math.IsNaN(number) ||
		math.IsInf(number, 0) ||
		math.Trunc(number) != number ||
		number > maxSafeInteger ||
		number < -maxSafeInteger {
		return 0, false
	}

	return int64(number), true
}
