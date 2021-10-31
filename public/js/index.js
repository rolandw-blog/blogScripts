document.addEventListener("DOMContentLoaded", () => {
	console.log("loaded index.js");
	document.querySelector(".caret").addEventListener("mousedown", (e) => {
		// create the social box
		const socialBox = document.createElement("div");
		socialBox.className = "socialBox";

		socialBox.appendChild(
			createSocialIcon("/static/twitter.svg", "https://twitter.com/RolandIRL")
		);
		socialBox.appendChild(
			createSocialIcon("/static/linkedin.svg", "https://www.linkedin.com/in/roland-w/")
		);
		socialBox.appendChild(
			createSocialIcon("/static/github.svg", "https://github.com/RolandWarburton")
		);

		// get the little spinny logo thing
		const caret = e.target;

		// load in and out the social box when you click on the spinny logo
		if (document.querySelector(".socialBox")) {
			document.querySelector(".socialBox").remove();
			caret.removeAttribute("id", "caret-flip");
		} else {
			e.target.parentNode.parentNode.appendChild(socialBox);
			caret.setAttribute("id", "caret-flip");
		}
	});
});

const createSocialIcon = function (imagePath, socialLink) {
	const socialIconAnchor = document.createElement("a");
	socialIconAnchor.href = socialLink;
	socialIconAnchor.className = "darkHyperLink";

	const socialIconImage = document.createElement("img");
	socialIconImage.src = imagePath;

	socialIconAnchor.appendChild(socialIconImage);

	return socialIconAnchor;
};
