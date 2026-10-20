package httpapi

import (
	"context"
	"net/http"
)

type ContactService interface {
	CreateMessage(context.Context, map[string]any) error
}

func handleContact(w http.ResponseWriter, r *http.Request, s ContactService) {
	w.Header().Set("Cache-Control", "no-store")
	if s == nil {
		writeSecurityError(w, 500, "Internal server error")
		return
	}
	if e := s.CreateMessage(r.Context(), requestJSON(r)); e != nil {
		sessionFailure(w, e)
		return
	}
	writeSecurityError(w, 201, "Contact message received")
}
